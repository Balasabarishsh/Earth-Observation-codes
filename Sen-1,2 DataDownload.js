
/************************************************************
 SENTINEL-1 & SENTINEL-2 AOI DATA DOWNLOAD WITH MOSAICKING

 Author: Bala Sabarish
 Platform: Google Earth Engine
 Purpose:
   1. Download Sentinel-1 SAR data
   2. Download Sentinel-2 optical data
   3. Filter by AOI and date
   4. Mosaic overlapping satellite scenes
   5. Clip outputs to AOI
   6. Export GeoTIFFs to Google Drive
************************************************************/


// ==========================================================
// 1. USER PARAMETERS
// ==========================================================

// Import your AOI as a FeatureCollection
var aoi = ee.FeatureCollection(
  'projects/your-project/assets/your_aoi'
);

var geometry = aoi.geometry();

// Date range (end date is exclusive)
var startDate = '2026-01-01';
var endDate   = '2026-03-31';

// Export folder
var exportFolder = 'GEE_Satellite_Data';

// Sentinel-1 orbit configuration
var orbitPass = 'DESCENDING';

// Export settings
var s1Scale = 10;
var s2Scale = 20;


// ==========================================================
// 2. AOI VISUALIZATION
// ==========================================================

Map.centerObject(aoi, 9);

Map.addLayer(
  aoi.style({
    color: 'red',
    fillColor: '00000000',
    width: 2
  }),
  {},
  'Study Area'
);


// ==========================================================
// 3. SENTINEL-1 SAR PROCESSING
// ==========================================================

var s1Collection = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(geometry)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.eq('orbitProperties_pass', orbitPass))
  .filter(ee.Filter.listContains(
    'transmitterReceiverPolarisation', 'VV'
  ))
  .filter(ee.Filter.listContains(
    'transmitterReceiverPolarisation', 'VH'
  ))
  .select(['VV', 'VH', 'angle']);


// Print collection information
print('Sentinel-1 image count:', s1Collection.size());
print('Sentinel-1 collection:', s1Collection);


// Sort by acquisition date
var s1Sorted = s1Collection.sort('system:time_start');

// Mosaic all intersecting scenes
var s1Mosaic = s1Sorted
  .mosaic()
  .clip(geometry);


// Visualization
Map.addLayer(
  s1Mosaic.select('VV'),
  {min: -25, max: 0},
  'Sentinel-1 VV'
);

Map.addLayer(
  s1Mosaic.select('VH'),
  {min: -30, max: -5},
  'Sentinel-1 VH'
);


// Export Sentinel-1 mosaic
Export.image.toDrive({
  image: s1Mosaic,
  description: 'Sentinel1_AOI_Mosaic',
  folder: exportFolder,
  fileNamePrefix: 'S1_VV_VH_AOI_Mosaic',
  region: geometry,
  scale: s1Scale,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


// ==========================================================
// 4. SENTINEL-2 CLOUD MASKING
// ==========================================================

function maskSentinel2(image) {

  var scl = image.select('SCL');

  // Remove cloud shadow, clouds, cirrus and snow/ice
  var cloudMask = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11))
    .and(scl.neq(0))
    .and(scl.neq(1));

  // Select spectral bands and convert to reflectance
  var optical = image.select([
    'B2', 'B3', 'B4',
    'B5', 'B6', 'B7',
    'B8', 'B8A',
    'B11', 'B12'
  ]).multiply(0.0001);

  return optical
    .updateMask(cloudMask)
    .copyProperties(image, ['system:time_start']);
}


// ==========================================================
// 5. SENTINEL-2 COLLECTION
// ==========================================================

var s2Collection = ee.ImageCollection(
  'COPERNICUS/S2_SR_HARMONIZED'
)
  .filterBounds(geometry)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 60))
  .map(maskSentinel2);


// Collection information
print('Sentinel-2 image count:', s2Collection.size());
print('Sentinel-2 collection:', s2Collection);


// ==========================================================
// 6. SENTINEL-2 MOSAICKING
// ==========================================================

// Sort by cloud percentage (cloudiest first).
// mosaic() prioritises later images in the collection,
// so clearer scenes are prioritised in overlapping areas.

var s2Sorted = s2Collection.sort(
  'CLOUDY_PIXEL_PERCENTAGE',
  false
);

// Generate mosaic
var s2Mosaic = s2Sorted
  .mosaic()
  .clip(geometry);


// ==========================================================
// 7. SENTINEL-2 VISUALIZATION
// ==========================================================

// True colour
Map.addLayer(
  s2Mosaic,
  {
    bands: ['B4', 'B3', 'B2'],
    min: 0,
    max: 0.3
  },
  'Sentinel-2 True Colour'
);

// False colour (NIR, Red, Green)
Map.addLayer(
  s2Mosaic,
  {
    bands: ['B8', 'B4', 'B3'],
    min: 0,
    max: 0.4
  },
  'Sentinel-2 False Colour',
  false
);


// ==========================================================
// 8. EXPORT SENTINEL-2 MOSAIC
// ==========================================================

Export.image.toDrive({
  image: s2Mosaic,
  description: 'Sentinel2_AOI_Mosaic',
  folder: exportFolder,
  fileNamePrefix: 'S2_Multispectral_AOI_Mosaic',
  region: geometry,
  scale: s2Scale,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


// ==========================================================
// 9. ADDITIONAL INFORMATION
// ==========================================================

print('AOI:', aoi);
print('Start date:', startDate);
print('End date:', endDate);
print('S1 orbit:', orbitPass);
print('S1 mosaic:', s1Mosaic);
print('S2 mosaic:', s2Mosaic);

print('Processing completed. Check the Tasks tab for exports.');
