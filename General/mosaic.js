
// 1. Define your geometry
// Replace this example with your imported geometry.
var roi = geometry;

// 2. Set the date range
var startDate = '2026-08-01';
var endDate   = '2026-09-01'; // End date is exclusive

// 3. Load Sentinel-2 Surface Reflectance
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 80));

// 4. Cloud and cirrus masking using SCL
function maskClouds(image) {
  var scl = image.select('SCL');

  var mask = scl.neq(3)   // Cloud shadow
    .and(scl.neq(8))      // Medium-probability clouds
    .and(scl.neq(9))      // High-probability clouds
    .and(scl.neq(10))     // Cirrus
    .and(scl.neq(11));    // Snow/ice

  return image.updateMask(mask)
    .select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .copyProperties(image, ['system:time_start']);
}

var s2Masked = s2.map(maskClouds);

// 5. Create the mosaic
// Median composite is generally more robust than a simple mosaic when multiple dates and overlapping scenes are present.
var mosaic = s2Masked.median().clip(roi);

print('Number of Sentinel-2 scenes:', s2.size());
print('Date range:', startDate, 'to', endDate);
print('Sentinel-2 mosaic:', mosaic);

// 6. False Colour Composite (FCC)
// SWIR2, NIR, Red = B12, B8, B4
var fcc = mosaic.select(['B12', 'B8', 'B4']);

Map.centerObject(roi, 10);

Map.addLayer(mosaic, {
  bands: ['B4', 'B3', 'B2'],
  min: 0,
  max: 3000,
  gamma: 1.2
}, 'True Colour Composite');

Map.addLayer(fcc, {
  min: 0,
  max: 3500,
  gamma: 1.2
}, 'FCC (B12, B8, B4)');

// 7. NDVI = (NIR - Red) / (NIR + Red)
var ndvi = mosaic.normalizedDifference(['B8', 'B4'])
  .rename('NDVI')
  .clip(roi);

Map.addLayer(ndvi, {
  min: -1,
  max: 1,
  palette: ['blue', 'white', 'green']
}, 'NDVI');

// 8. NDWI (McFeeters) = (Green - NIR) / (Green + NIR)
var ndwi = mosaic.normalizedDifference(['B3', 'B8'])
  .rename('NDWI')
  .clip(roi);

Map.addLayer(ndwi, {
  min: -1,
  max: 1,
  palette: ['brown', 'white', 'blue']
}, 'NDWI');

// 9. Export mosaic to Google Drive
Export.image.toDrive({
  image: mosaic,
  description: 'S2_Mosaic',
  folder: 'GEE_Exports',
  region: roi,
  scale: 10,
  maxPixels: 1e13
});

// 10. Export FCC, NDVI and NDWI
Export.image.toDrive({
  image: fcc,
  description: 'S2_FCC',
  folder: 'GEE_Exports',
  region: roi,
  scale: 10,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: ndvi,
  description: 'S2_NDVI',
  folder: 'GEE_Exports',
  region: roi,
  scale: 10,
  maxPixels: 1e13
});

Export.image.toDrive({
  image: ndwi,
  description: 'S2_NDWI',
  folder: 'GEE_Exports',
  region: roi,
  scale: 10,
  maxPixels: 1e13
});
