import { Schema, model } from "mongoose";
import { fieldScopes, fieldTypes } from "../types.js";
import type { Customer, DocumentSet, FieldDefinition, Property } from "../types.js";

const timestamps = { timestamps: true, minimize: false } as const;
const fieldDefinitionSchema = new Schema<FieldDefinition>(
  {
    key: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true },
    scope: { type: String, enum: fieldScopes },
    type: { type: String, enum: fieldTypes, default: "text" },
    aliases: { type: [String], default: [] },
    searchable: { type: Boolean, default: false },
    filterable: { type: Boolean, default: false },
    classified: { type: Boolean, default: false },
  },
  timestamps,
);
fieldDefinitionSchema.index({ aliases: 1 });

const customerSchema = new Schema<Customer>(
  {
    displayName: { type: String, required: true, index: true },
    idNumber: { type: String, index: true },
    phone: { type: String, index: true },
    email: String,
    fields: { type: Schema.Types.Mixed, default: {} },
  },
  timestamps,
);
const propertySchema = new Schema<Property>(
  {
    displayName: { type: String, required: true, index: true },
    address: { type: String, index: true },
    fields: { type: Schema.Types.Mixed, default: {} },
  },
  timestamps,
);
const documentSetSchema = new Schema<DocumentSet>(
  { name: { type: String, required: true }, templateIds: { type: [String], default: [] } },
  timestamps,
);

export const FieldDefinitionModel = model("FieldDefinition", fieldDefinitionSchema);
export const CustomerModel = model("Customer", customerSchema);
export const PropertyModel = model("Property", propertySchema);
export const DocumentSetModel = model("DocumentSet", documentSetSchema);
