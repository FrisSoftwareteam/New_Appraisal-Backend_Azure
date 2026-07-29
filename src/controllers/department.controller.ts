import Department from '../models/Department';
import { createTaxonomyController } from './orgTaxonomy.controller';

export const { getAll, getById, create, update, remove, getUnmapped } = createTaxonomyController(
  Department,
  'department',
  'Department'
);
