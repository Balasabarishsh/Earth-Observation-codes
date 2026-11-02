
// ============================================
// CHIRPS RAINFALL ANALYSIS
// Note: CHIRPS data is availabe witha delay of 15-20 days or so. For real-time data refer imdlib
// ============================================

// use your own roi file
var roi = ee.Geometry.Rectangle([76.5, 10.5, 77.5, 11.5]);

Map.centerObject(roi, 8);

var startDate = '2026-06-01';
var endDate = '2026-10-01';

// Load CHIRPS daily precipitation
var rainfall = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterBounds(roi)
  .filterDate(startDate, endDate)
  .select('precipitation');

// Cumulative rainfall
var cumulativeRainfall = rainfall.sum()
  .clip(roi)
  .rename('Cumulative_Rainfall');

// Mean daily rainfall
var meanRainfall = rainfall.mean()
  .clip(roi)
  .rename('Mean_Daily_Rainfall');

// Visualization
Map.addLayer(
  cumulativeRainfall,
  {min: 0, max: 1000,
   palette: ['white', 'yellow', 'orange', 'red', 'blue']},
  'Cumulative Rainfall'
);

// Regional statistics
var stats = cumulativeRainfall.reduceRegion({
  reducer: ee.Reducer.mean()
    .combine(ee.Reducer.minMax(), '', true),
  geometry: roi,
  scale: 5566,
  maxPixels: 1e13
});

print('Rainfall statistics (mm):', stats);

// Export
Export.image.toDrive({
  image: cumulativeRainfall,
  description: 'CHIRPS_Cumulative_Rainfall',
  region: roi,
  scale: 5566,
  maxPixels: 1e13
});
