import { readFile } from "node:fs/promises";
import { Router } from "express";
import PizZip from "pizzip";
import { z } from "zod";
import { CustomerModel, DocumentSetModel, FieldDefinitionModel, PropertyModel } from "./database/models.js";
import { generateDocument } from "./generation/document-generator.js";
import { getRequirements } from "./generation/requirements.service.js";
import { validateValues } from "./generation/validation.service.js";
import { AppError, asyncRoute } from "./http.js";
import { scanTemplates } from "./templates/template-scanner.js";
import { templateRegistry } from "./templates/template-registry.js";
import { fieldScopes, fieldTypes } from "./types.js";

const id = z.string().min(1);
const values = z.record(z.string(), z.unknown()).default({});
const entityInput = z.object({ displayName: z.string().min(1), idNumber: z.string().optional(), phone: z.string().optional(), email: z.string().email().optional().or(z.literal("")), address: z.string().optional(), fields: values });
const setInput = z.object({ name: z.string().min(1), templateIds: z.array(id) });
const generationInput = z.object({ templateIds: z.array(id).min(1), buyers: z.array(z.object({ customerId: id.optional(), values })), sellers: z.array(z.object({ customerId: id.optional(), values })), property: z.object({ propertyId: id.optional(), values }), transactionValues: values });
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const router = Router();
router.get("/templates", (_req, res) => res.json(templateRegistry.list().map(({ absolutePath, ...item }) => item)));
router.post("/templates/refresh", asyncRoute(async (_req, res) => res.json((await scanTemplates()).map(({ absolutePath, ...item }) => item))));
router.get("/fields", asyncRoute(async (req, res) => { const filter = req.query.scope ? { scope: req.query.scope } : {}; res.json(await FieldDefinitionModel.find(filter).sort({ label: 1 }).lean()); }));
router.patch("/fields/:id", asyncRoute(async (req, res) => {
  const body = z.object({ label: z.string().min(1).optional(), scope: z.enum(fieldScopes).optional(), type: z.enum(fieldTypes).optional(), aliases: z.array(z.string()).optional(), searchable: z.boolean().optional(), filterable: z.boolean().optional() }).parse(req.body);
  const updated = await FieldDefinitionModel.findByIdAndUpdate(req.params.id, { ...body, classified: Boolean(body.scope) || undefined }, { new: true, runValidators: true }); if (!updated) throw new AppError(404, "NOT_FOUND"); await scanTemplates(); res.json(updated);
}));

function entityRoutes(path: string, model: typeof CustomerModel | typeof PropertyModel, scope: "person" | "property") {
  const entityModel = model as any;
  router.get(path, asyncRoute(async (req, res) => {
    const query = String(req.query.q ?? "").trim(); const filters: any[] = [];
    if (query) { const pattern = new RegExp(escapeRegex(query), "i"); const definitions = await FieldDefinitionModel.find({ scope, searchable: true }).lean(); filters.push({ $or: [{ displayName: pattern }, { idNumber: pattern }, { phone: pattern }, { address: pattern }, ...definitions.map((item) => ({ [`fields.${item.key}`]: pattern }))] }); }
    const definitions = await FieldDefinitionModel.find({ scope, filterable: true }).lean();
    for (const definition of definitions) { const value = req.query[`filter.${definition.key}`]; if (typeof value === "string" && value) filters.push({ [`fields.${definition.key}`]: value }); }
    res.json(await entityModel.find(filters.length ? { $and: filters } : {}).limit(50).sort({ updatedAt: -1 }).lean());
  }));
  router.get(`${path}/:id`, asyncRoute(async (req, res) => { const found = await entityModel.findById(req.params.id).lean(); if (!found) throw new AppError(404, "NOT_FOUND"); res.json(found); }));
  router.post(path, asyncRoute(async (req, res) => { const body = entityInput.parse(req.body); res.status(201).json(await entityModel.create(body)); }));
  router.patch(`${path}/:id`, asyncRoute(async (req, res) => { const body = entityInput.partial().parse(req.body); const updated = await entityModel.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true }); if (!updated) throw new AppError(404, "NOT_FOUND"); res.json(updated); }));
}
entityRoutes("/customers", CustomerModel, "person"); entityRoutes("/properties", PropertyModel, "property");
router.get("/document-sets", asyncRoute(async (_req, res) => res.json(await DocumentSetModel.find().sort({ name: 1 }).lean())));
router.post("/document-sets", asyncRoute(async (req, res) => res.status(201).json(await DocumentSetModel.create(setInput.parse(req.body)))));
router.patch("/document-sets/:id", asyncRoute(async (req, res) => { const updated = await DocumentSetModel.findByIdAndUpdate(req.params.id, setInput.partial().parse(req.body), { new: true, runValidators: true }); if (!updated) throw new AppError(404, "NOT_FOUND"); res.json(updated); }));
router.delete("/document-sets/:id", asyncRoute(async (req, res) => { const deleted = await DocumentSetModel.findByIdAndDelete(req.params.id); if (!deleted) throw new AppError(404, "NOT_FOUND"); res.status(204).end(); }));
router.post("/generation/requirements", asyncRoute(async (req, res) => res.json(await getRequirements(z.object({ templateIds: z.array(id).min(1) }).parse(req.body).templateIds))));
router.post("/generation/generate", asyncRoute(async (req, res) => {
  const body = generationInput.parse(req.body); const templates = body.templateIds.map((templateId) => templateRegistry.get(templateId));
  if (templates.some((item) => !item)) throw new AppError(409, "TEMPLATE_CHANGED"); if (templates.some((item) => !item!.valid)) throw new AppError(422, "TEMPLATE_INVALID");
  const mergedValues = { ...body.property.values, ...body.transactionValues, ...(body.buyers[0]?.values ?? {}), ...(body.sellers[0]?.values ?? {}) }; validateValues(templates as any, mergedValues);
  const outputs = await Promise.all(templates.map(async (template) => ({ name: template!.filename, buffer: generateDocument({ templateBuffer: await readFile(template!.absolutePath), templateDefinition: template!, values: mergedValues, buyers: body.buyers.map((party) => party.values), sellers: body.sellers.map((party) => party.values) }) })));
  if (outputs.length === 1) { res.type("application/vnd.openxmlformats-officedocument.wordprocessingml.document").attachment(outputs[0]!.name).send(outputs[0]!.buffer); return; }
  const zip = new PizZip(); for (const output of outputs) zip.file(output.name, output.buffer); res.type("application/zip").attachment("מסמכי עסקה.zip").send(zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
}));
