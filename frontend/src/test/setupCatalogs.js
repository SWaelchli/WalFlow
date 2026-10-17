// Tests run without the backend: load the seeded fitting catalogs (backend `fitting_defaults.py`)
// into the catalog cache, as the app does after its first API response.
import catalogs from './fixtures/catalogs.json';
import { primeFittingStandards } from '../hooks/useFittingStandards';

primeFittingStandards('pipe_schedule', catalogs.filter(c => c.fitting_type === 'pipe_schedule'));
primeFittingStandards('reducer', catalogs.filter(c => c.fitting_type === 'reducer'));
