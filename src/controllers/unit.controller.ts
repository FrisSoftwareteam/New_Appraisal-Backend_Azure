import Unit from '../models/Unit';
import { createTaxonomyController } from './orgTaxonomy.controller';

export const { getAll, getById, create, update, remove, getUnmapped } = createTaxonomyController(
  Unit,
  'unit',
  'Unit'
);
