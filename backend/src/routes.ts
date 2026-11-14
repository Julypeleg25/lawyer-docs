import { readFile } from "node:fs/promises";
import { Router } from "express";
import type { FilterQuery, Model } from "mongoose";
import PizZip from "pizzip";
import { z } from "zod";
import {
  CustomerModel,
  DocumentSetModel,
  FieldDefinitionModel,
  PropertyModel,
} from "./database/models.js";
import { resetFieldClassifications } from "./fields/field.service.js";
import { generateDocument } from "./generation/document-generator.js";
import { getRequirements } from "./generation/requirements.service.js";
import { validatePartyCounts, validateValues } from "./generation/validation.service.js";
import { AppError, asyncRoute } from "./http.js";
import { scanTemplates } from "./templates/template-scanner.js";
import { templateRegistry } from "./templates/template-registry.js";
import { fieldScopes, fieldTypes } from "./types.js";
import type { Customer, Property, TemplateDefinition, TemplateFieldRequirement } from "./types.js";

const id = z.string().min(1);
const values = z.record(z.string(), z.unknown()).default({});
const entityInput = z.object({
  displayName: z.string().min(1),
  idNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  fields: values,
});
const setInput = z.object({ name: z.string().min(1), templateIds: z.array(id) });
const classificationInput = z.object({
  classifications: z
    .array(
      z.object({
        id: z.string().regex(/^[a-f\d]{24}$/iu),
        scope: z.enum(fieldScopes),
        type: z.enum(fieldTypes),
        searchable: z.boolean(),
        filterable: z.boolean(),
      }),
    )
    .min(1),
});
const classificationResetInput = z
  .object({
    fieldIds: z
      .array(z.string().regex(/^[a-f\d]{24}$/iu))
      .min(1)
      .optional(),
  })
  .default({});
const generationInput = z.object({
  templateIds: z.array(id).min(1),
  buyers: z.array(z.object({ customerId: id.optional(), values })),
  sellers: z.array(z.object({ customerId: id.optional(), values })),
  property: z.object({ propertyId: id.optional(), values }),
  transactionValues: values,
});
const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type PublicTemplate = Omit<TemplateDefinition, "absolutePath">;
type ResolvedTemplateField = TemplateFieldRequirement & { key: string };

function toPublicTemplate(template: TemplateDefinition): PublicTemplate {
  return {
    id: template.id,
    filename: template.filename,
    displayName: template.displayName,
    hash: template.hash,
    fields: template.fields,
    repeatSections: template.repeatSections,
    valid: template.valid,
    errors: template.errors,
  };
}

function getSelectedTemplates(templateIds: string[]): TemplateDefinition[] {
  return templateIds.map((templateId) => {
    const template = templateRegistry.get(templateId);
    if (!template) {
      throw new AppError(409, "TEMPLATE_CHANGED");
    }
    return template;
  });
}

export const router = Router();
router.get("/templates", (_req, res) => res.json(templateRegistry.list().map(toPublicTemplate)));
router.post(
  "/templates/refresh",
  asyncRoute(async (_req, res) => res.json((await scanTemplates()).map(toPublicTemplate))),
);
router.get(
  "/fields",
  asyncRoute(async (req, res) => {
    const filter = req.query.scope ? { scope: req.query.scope } : {};
    res.json(await FieldDefinitionModel.find(filter).sort({ label: 1 }).lean());
  }),
);
router.patch(
  "/fields/:id",
  asyncRoute(async (req, res) => {
    const body = z
      .object({
        label: z.string().min(1).optional(),
        scope: z.enum(fieldScopes).optional(),
        type: z.enum(fieldTypes).optional(),
        aliases: z.array(z.string()).optional(),
        searchable: z.boolean().optional(),
        filterable: z.boolean().optional(),
      })
      .parse(req.body);
    const updated = await FieldDefinitionModel.findByIdAndUpdate(req.params.id, body, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new AppError(404, "NOT_FOUND");
    await scanTemplates();
    res.json(updated);
  }),
);
router.put(
  "/fields/classifications",
  asyncRoute(async (req, res) => {
    const { classifications } = classificationInput.parse(req.body);
    const pendingFields = await FieldDefinitionModel.find({ classified: false }, { _id: 1 }).lean();
    const pendingIds = new Set(pendingFields.map((field) => field._id.toString()));
    const submittedIds = new Set(classifications.map((classification) => classification.id));
    const includesEveryPendingField =
      pendingIds.size === submittedIds.size &&
      [...pendingIds].every((fieldId) => submittedIds.has(fieldId));
    if (!includesEveryPendingField) {
      throw new AppError(409, "CLASSIFICATION_SET_CHANGED", {
        expectedCount: pendingIds.size,
        submittedCount: submittedIds.size,
      });
    }

    await FieldDefinitionModel.bulkWrite(
      classifications.map(({ id: fieldId, ...classification }) => ({
        updateOne: {
          filter: { _id: fieldId, classified: false },
          update: { $set: { ...classification, classified: true } },
        },
      })),
      { ordered: true },
    );
    await scanTemplates();
    res.json(await FieldDefinitionModel.find().sort({ label: 1 }).lean());
  }),
);
router.post(
  "/fields/classifications/reset",
  asyncRoute(async (req, res) => {
    const { fieldIds } = classificationResetInput.parse(req.body);
    await resetFieldClassifications(fieldIds);
    await scanTemplates();
    res.json(await FieldDefinitionModel.find().sort({ label: 1 }).lean());
  }),
);

function entityRoutes<T extends Customer | Property>(
  path: string,
  model: Model<T>,
  scope: "person" | "property",
): void {
  router.get(
    path,
    asyncRoute(async (req, res) => {
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const filters: FilterQuery<T>[] = [];
      if (query) {
        const pattern = new RegExp(escapeRegex(query), "i");
        const definitions = await FieldDefinitionModel.find({ scope, searchable: true }).lean();
        filters.push({
          $or: [
            { displayName: pattern },
            { idNumber: pattern },
            { phone: pattern },
            { address: pattern },
            ...definitions.map((item) => ({ [`fields.${item.key}`]: pattern })),
          ],
        } as FilterQuery<T>);
      }
      const definitions = await FieldDefinitionModel.find({ scope, filterable: true }).lean();
      for (const definition of definitions) {
        const value = req.query[`filter.${definition.key}`];
        if (typeof value === "string" && value)
          filters.push({ [`fields.${definition.key}`]: value } as FilterQuery<T>);
      }
      res.json(
        await model
          .find(filters.length ? { $and: filters } : {})
          .limit(50)
          .sort({ updatedAt: -1 })
          .lean(),
      );
    }),
  );
  router.get(
    `${path}/:id`,
    asyncRoute(async (req, res) => {
      const found = await model.findById(req.params.id).lean();
      if (!found) throw new AppError(404, "NOT_FOUND");
      res.json(found);
    }),
  );
  router.post(
    path,
    asyncRoute(async (req, res) => {
      const body = entityInput.parse(req.body);
      res.status(201).json(await model.create(body as T));
    }),
  );
  router.patch(
    `${path}/:id`,
    asyncRoute(async (req, res) => {
      const body = entityInput.partial().parse(req.body);
      const updated = await model.findByIdAndUpdate(req.params.id, body, {
        new: true,
        runValidators: true,
      });
      if (!updated) throw new AppError(404, "NOT_FOUND");
      res.json(updated);
    }),
  );
}
entityRoutes("/customers", CustomerModel, "person");
entityRoutes("/properties", PropertyModel, "property");
router.get(
  "/document-sets",
  asyncRoute(async (_req, res) => res.json(await DocumentSetModel.find().sort({ name: 1 }).lean())),
);
router.post(
  "/document-sets",
  asyncRoute(async (req, res) =>
    res.status(201).json(await DocumentSetModel.create(setInput.parse(req.body))),
  ),
);
router.patch(
  "/document-sets/:id",
  asyncRoute(async (req, res) => {
    const updated = await DocumentSetModel.findByIdAndUpdate(
      req.params.id,
      setInput.partial().parse(req.body),
      { new: true, runValidators: true },
    );
    if (!updated) throw new AppError(404, "NOT_FOUND");
    res.json(updated);
  }),
);
router.delete(
  "/document-sets/:id",
  asyncRoute(async (req, res) => {
    const deleted = await DocumentSetModel.findByIdAndDelete(req.params.id);
    if (!deleted) throw new AppError(404, "NOT_FOUND");
    res.status(204).end();
  }),
);
router.post(
  "/generation/requirements",
  asyncRoute(async (req, res) =>
    res.json(
      await getRequirements(
        z.object({ templateIds: z.array(id).min(1) }).parse(req.body).templateIds,
      ),
    ),
  ),
);
router.post(
  "/generation/generate",
  asyncRoute(async (req, res) => {
    const body = generationInput.parse(req.body);
    const templates = getSelectedTemplates(body.templateIds);
    if (templates.some((template) => !template.valid)) {
      throw new AppError(422, "TEMPLATE_INVALID");
    }
    validatePartyCounts(templates, body.buyers.length, body.sellers.length);
    const mergedValues = {
      ...body.property.values,
      ...body.transactionValues,
    };
    const nonPersonTemplates = templates.map((template) => ({
      ...template,
      fields: template.fields.filter((field) => field.scope !== "person"),
    }));
    validateValues(nonPersonTemplates, mergedValues);
    const buyerFieldsByKey = new Map<string, ResolvedTemplateField>();
    const sellerFieldsByKey = new Map<string, ResolvedTemplateField>();
    for (const template of templates) {
      for (const field of template.fields) {
        if (field.scope === "person" && field.required && field.key) {
          const resolvedField = { ...field, key: field.key };
          if (field.partyRole !== "seller") buyerFieldsByKey.set(field.key, resolvedField);
          if (field.partyRole !== "buyer") sellerFieldsByKey.set(field.key, resolvedField);
        }
      }
    }
    const missingParties: {
      group: "buyers" | "sellers";
      index: number;
      key: string;
      label: string;
    }[] = [];
    for (const [group, parties, requiredFields] of [
      ["buyers", body.buyers, [...buyerFieldsByKey.values()]],
      ["sellers", body.sellers, [...sellerFieldsByKey.values()]],
    ] as const)
      for (const [index, party] of parties.entries())
        for (const field of requiredFields)
          if (
            party.values[field.key] === undefined ||
            party.values[field.key] === null ||
            party.values[field.key] === ""
          )
            missingParties.push({ group, index, key: field.key, label: field.label });
    if (missingParties.length)
      throw new AppError(422, "MISSING_FIELDS", { fields: missingParties });
    const outputs = await Promise.all(
      templates.map(async (template) => ({
        name: template.filename,
        buffer: generateDocument({
          templateBuffer: await readFile(template.absolutePath),
          templateDefinition: template,
          values: mergedValues,
          buyers: body.buyers.map((party) => party.values),
          sellers: body.sellers.map((party) => party.values),
        }),
      })),
    );
    if (outputs.length === 1) {
      res
        .type("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        .attachment(outputs[0]!.name)
        .send(outputs[0]!.buffer);
      return;
    }
    const zip = new PizZip();
    for (const output of outputs) zip.file(output.name, output.buffer);
    res
      .type("application/zip")
      .attachment("מסמכי עסקה.zip")
      .send(zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  }),
);
