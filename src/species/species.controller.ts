import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/**
 * Species reference list.
 *
 * Enriched with wood density and a typical form factor so the app can produce
 * a usable volume estimate before the user has fitted their own equation.
 * Amazonian species were added because the original list was dominated by
 * planted eucalyptus and pine, which is not what an inventory in Acre runs
 * into.
 *
 * `formFactor` values are literature typicals for native tropical hardwoods
 * (~0.6-0.7) and plantations (~0.45-0.5). They are STARTING POINTS: a form
 * factor fitted from the user's own cubed trees always beats a table value,
 * which is exactly what the equations module exists for.
 * `density` is basic density in g/cm³, used to convert volume to mass.
 * `buttressed` flags species that commonly have sapopemas, where the diameter
 * must be measured above the buttress and the POM recorded.
 */
const BRAZILIAN_SPECIES = [
  // --- Amazônia / nativas ---
  { name: 'Bertholletia excelsa', commonName: 'Castanheira', density: 0.64, formFactor: 0.70, buttressed: true },
  { name: 'Cedrela odorata', commonName: 'Cedro', density: 0.44, formFactor: 0.65, buttressed: false },
  { name: 'Cedrela fissilis', commonName: 'Cedro-rosa', density: 0.47, formFactor: 0.65, buttressed: false },
  { name: 'Swietenia macrophylla', commonName: 'Mogno', density: 0.51, formFactor: 0.66, buttressed: false },
  { name: 'Dipteryx odorata', commonName: 'Cumaru', density: 0.91, formFactor: 0.68, buttressed: false },
  { name: 'Hymenaea courbaril', commonName: 'Jatobá', density: 0.79, formFactor: 0.68, buttressed: false },
  { name: 'Handroanthus serratifolius', commonName: 'Ipê-amarelo', density: 0.92, formFactor: 0.65, buttressed: false },
  { name: 'Handroanthus impetiginosus', commonName: 'Ipê-roxo', density: 0.91, formFactor: 0.65, buttressed: false },
  { name: 'Apuleia leiocarpa', commonName: 'Amarelão / Garapeira', density: 0.77, formFactor: 0.67, buttressed: false },
  { name: 'Manilkara huberi', commonName: 'Maçaranduba', density: 0.87, formFactor: 0.70, buttressed: false },
  { name: 'Ceiba pentandra', commonName: 'Sumaúma', density: 0.28, formFactor: 0.62, buttressed: true },
  { name: 'Hura crepitans', commonName: 'Assacu', density: 0.38, formFactor: 0.64, buttressed: true },
  { name: 'Amburana acreana', commonName: 'Cerejeira', density: 0.55, formFactor: 0.66, buttressed: false },
  { name: 'Aspidosperma macrocarpon', commonName: 'Peroba', density: 0.75, formFactor: 0.66, buttressed: false },
  { name: 'Copaifera multijuga', commonName: 'Copaíba', density: 0.63, formFactor: 0.67, buttressed: false },
  { name: 'Torresea acreana', commonName: 'Cumaru-de-cheiro', density: 0.60, formFactor: 0.66, buttressed: false },
  { name: 'Hevea brasiliensis', commonName: 'Seringueira', density: 0.53, formFactor: 0.60, buttressed: false },
  { name: 'Carapa guianensis', commonName: 'Andiroba', density: 0.59, formFactor: 0.67, buttressed: true },
  { name: 'Virola surinamensis', commonName: 'Virola / Ucuúba', density: 0.44, formFactor: 0.66, buttressed: false },
  { name: 'Tabebuia serratifolia', commonName: 'Pau-d\'arco', density: 0.89, formFactor: 0.65, buttressed: false },
  { name: 'Astronium lecointei', commonName: 'Muiracatiara', density: 0.79, formFactor: 0.67, buttressed: false },
  { name: 'Couratari guianensis', commonName: 'Tauari', density: 0.58, formFactor: 0.69, buttressed: true },
  { name: 'Qualea albiflora', commonName: 'Cambará', density: 0.66, formFactor: 0.68, buttressed: false },
  { name: 'Erisma uncinatum', commonName: 'Cedrinho / Quarubarana', density: 0.55, formFactor: 0.68, buttressed: false },
  { name: 'Dalbergia nigra', commonName: 'Jacarandá', density: 0.83, formFactor: 0.64, buttressed: false },
  { name: 'Paubrasilia echinata', commonName: 'Pau-Brasil', density: 0.90, formFactor: 0.63, buttressed: false },
  { name: 'Araucaria angustifolia', commonName: 'Araucária', density: 0.50, formFactor: 0.50, buttressed: false },

  // --- Plantios ---
  { name: 'Tectona grandis', commonName: 'Teca', density: 0.58, formFactor: 0.52, buttressed: false },
  { name: 'Eucalyptus grandis', commonName: 'Eucalipto', density: 0.48, formFactor: 0.47, buttressed: false },
  { name: 'Eucalyptus saligna', commonName: 'Eucalipto-saligna', density: 0.51, formFactor: 0.47, buttressed: false },
  { name: 'Eucalyptus urophylla', commonName: 'Eucalipto-urofila', density: 0.52, formFactor: 0.47, buttressed: false },
  { name: 'Eucalyptus camaldulensis', commonName: 'Eucalipto-camaldulensis', density: 0.55, formFactor: 0.47, buttressed: false },
  { name: 'Pinus elliottii', commonName: 'Pinus', density: 0.42, formFactor: 0.45, buttressed: false },
  { name: 'Pinus taeda', commonName: 'Pinus-taeda', density: 0.40, formFactor: 0.45, buttressed: false },
  { name: 'Schizolobium amazonicum', commonName: 'Paricá', density: 0.30, formFactor: 0.55, buttressed: false },

  { name: 'Outra', commonName: 'Outra espécie', density: null, formFactor: 0.60, buttressed: false },
];

@ApiTags('Species')
@Controller('api/species')
export class SpeciesController {
  @Get()
  @ApiOperation({ summary: 'Get list of common Brazilian tree species' })
  getSpecies() {
    return { items: BRAZILIAN_SPECIES };
  }
}
