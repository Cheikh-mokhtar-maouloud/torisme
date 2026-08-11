import { Schema, model, models, type InferSchemaType, type Model } from 'mongoose';

import { PlaceType } from '@tourism/shared/constants';

import { baseSchemaOptions } from './shared-schemas';

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    /** Type de lieu concerné : une catégorie « Plage » ne s'applique qu'aux attractions. */
    appliesTo: { type: String, enum: Object.values(PlaceType), required: true, index: true },
    iconUrl: { type: String },
    isActive: { type: Boolean, default: true, index: true },
  },
  baseSchemaOptions,
);

// Le slug n'est unique que dans le périmètre d'un type de lieu : « traditionnel »
// peut exister à la fois pour un restaurant et pour une attraction.
categorySchema.index({ appliesTo: 1, slug: 1 }, { unique: true });

export type CategoryDocument = InferSchemaType<typeof categorySchema>;

export const Category: Model<CategoryDocument> =
  (models.Category as Model<CategoryDocument>) ??
  model<CategoryDocument>('Category', categorySchema);
