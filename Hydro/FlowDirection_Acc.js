
/************************************************************
 FLOW DIRECTION & FLOW ACCUMULATION
 Dataset: MERIT Hydro
 Resolution: ~90 metres
 Method: D8 flow direction (precomputed)

 Author: Bala Sabarish
************************************************************/

// ==========================================================
// 1. STUDY AREA
// ==========================================================

var aoi = ee.FeatureCollection(
  'projects/your-project/assets/your_aoi'
);

var geometry = aoi.geometry();

Map.centerObject(aoi, 9);

Map.addLayer(
  aoi.style({
    color: 'red',
    fillColor: '00000000'
  }),
  {},
  'AOI'
);


// ==========================================================
// 2. LOAD MERIT HYDRO
// ==========================================================

var merit = ee.Image('MERIT/Hydro/v1_0_1')
  .clip(geometry);

print('MERIT Hydro:', merit);
print('Available bands:', merit.bandNames());


// ==========================================================
// 3. FLOW DIRECTION
// ==========================================================

var flowDirection = merit
  .select('dir')
  .rename('Flow_Direction');

Map.addLayer(
  flowDirection,
  {
    min: 1,
    max: 128,
    palette: [
      '0000FF',
      '00FFFF',
      '00FF00',
      'FFFF00',
      'FF8000',
      'FF0000',
      '800080',
      'FFFFFF'
    ]
  },
  'Flow Direction (D8)'
);


// ==========================================================
// 4. FLOW ACCUMULATION
// ==========================================================

// Upstream drainage area in km2
var flowAccumulation = merit
  .select('upa')
  .rename('Flow_Accumulation_km2');


// Log transformation for visualization
var logAccumulation = flowAccumulation
  .add(1)
  .log10();

Map.addLayer(
  logAccumulation,
  {
    min: 0,
    max: 4,
    palette: [
      'FFFFFF',
      'BFEFFF',
      '00BFFF',
      '0000FF',
      '000080'
    ]
  },
  'Flow Accumulation (Log10)'
);


// ==========================================================
// 5. STREAM NETWORK EXTRACTION
// ==========================================================

// Threshold in square kilometres
var threshold = 10;

// Extract cells with upstream area > threshold
var streams = flowAccumulation
  .gte(threshold)
  .selfMask()
  .rename('Stream_Network');

Map.addLayer(
  streams,
  {palette: ['0000FF']},
  'Extracted Stream Network'
);


// ==========================================================
// 6. UPSTREAM CONTRIBUTING PIXELS
// ==========================================================

var upstreamPixels = merit
  .select('upg')
  .rename('Upstream_Pixels');

Map.addLayer(
  upstreamPixels.add(1).log10(),
  {
    min: 0,
    max: 4,
    palette: ['white', 'cyan', 'blue', 'navy']
  },
  'Upstream Pixel Count',
  false
);


// ==========================================================
// 7. EXPORT FLOW DIRECTION
// ==========================================================

Export.image.toDrive({
  image: flowDirection,
  description: 'MERIT_Flow_Direction',
  folder: 'GEE_Hydrology',
  fileNamePrefix: 'Flow_Direction_D8',
  region: geometry,
  scale: 90,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


// ==========================================================
// 8. EXPORT FLOW ACCUMULATION
// ==========================================================

Export.image.toDrive({
  image: flowAccumulation,
  description: 'MERIT_Flow_Accumulation',
  folder: 'GEE_Hydrology',
  fileNamePrefix: 'Flow_Accumulation_km2',
  region: geometry,
  scale: 90,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});


// ==========================================================
// 9. EXPORT STREAM NETWORK
// ==========================================================

Export.image.toDrive({
  image: streams,
  description: 'MERIT_Stream_Network',
  folder: 'GEE_Hydrology',
  fileNamePrefix: 'Stream_Network',
  region: geometry,
  scale: 90,
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF'
});

print('Hydrological processing completed.');
