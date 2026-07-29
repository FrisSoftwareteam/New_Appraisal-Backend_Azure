import JobRole from '../models/JobRole';
import { createTaxonomyController } from './orgTaxonomy.controller';

export const { getAll, getById, create, update, remove, getUnmapped } = createTaxonomyController(
  JobRole,
  'jobTitle',
  'Job Role'
);
