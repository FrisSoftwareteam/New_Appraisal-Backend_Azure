import Division from '../models/Division';
import { createTaxonomyController } from './orgTaxonomy.controller';

export const { getAll, getById, create, update, remove, getUnmapped } = createTaxonomyController(
  Division,
  'division',
  'Division'
);
