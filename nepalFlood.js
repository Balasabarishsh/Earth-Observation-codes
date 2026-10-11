var geometry = /* color: #d63000 */ee.Geometry.LineString(
        [[85.5129018796748, 28.28041617429596],
         [85.49985561502636, 28.307019080344645],
         [85.48612270487011, 28.320015808849053],
         [85.48474941385449, 28.33029116727242],
         [85.48131618631542, 28.333917527198732],
         [85.45659694803417, 28.336335031731075],
         [85.43977413309277, 28.334824097844074],
         [85.42878780496777, 28.33029116727242],
         [85.41608486307324, 28.3278735252408],
         [85.41230831278027, 28.32545582821482],
         [85.41196499002636, 28.318504642957002],
         [85.41230831278027, 28.308228145344593],
         [85.40372524393261, 28.304298633851083],
         [85.3978887571162, 28.297950654844943],
         [85.39411220682324, 28.2916022971539],
         [85.38552913797558, 28.284951230612812],
         [85.3759161008662, 28.27648563593442],
         [85.37797603738964, 28.272554952525002],
         [85.37488613260449, 28.26711222837108],
         [85.37145290506542, 28.260459632406434],
         [85.3642431272334, 28.254109039800326],
         [85.36527309549511, 28.25108481511633],
         [85.3645864499873, 28.248060504655495],
         [85.36080989969433, 28.24412877282989],
         [85.35771999490917, 28.23989443800287],
         [85.3590932859248, 28.233845096688214],
         [85.36080989969433, 28.229005376695337],
         [85.36046657694042, 28.222955418068118],
         [85.35497341287792, 28.216905116556696],
         [85.35463009012402, 28.20934175755967]]),
    geometry2 = /* color: #98ff00 */ee.Geometry.LinearRing(
        [[85.5006846315033, 28.29193168798133],
         [85.50926770035096, 28.27288440227475],
         [85.52712048355409, 28.27983856809795],
         [85.51819409195252, 28.297977732800778],
         [85.5006846315033, 28.29193168798133]]);

var buffer = geometry.buffer(2000);
Map.setOptions("HYBRID");
// Map.centerObject(buffer, 10);
Map.addLayer(buffer,{color: 'red'},'Buffer Polygon');
var bufferGeometry = buffer;

// ===================================================================================
//Sentinel-2
var targetDate = ee.Date('2023-05-01');
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(buffer)
  .filterDate(
    targetDate.advance(-30, 'day'),  targetDate.advance(30, 'day'))
  .filter( ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

// Cloud mask
function maskS2clouds(image) {

  var qa = image.select('QA60');

  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;

  var mask = qa
    .bitwiseAnd(cloudBitMask).eq(0)
    .and(
      qa.bitwiseAnd(cirrusBitMask).eq(0)
    );return image.updateMask(mask).divide(10000).copyProperties(image, ['system:time_start']);}
var s2Masked = s2.map(maskS2clouds);

// Find image nearest to target date
var nearest = s2Masked.map(function(image) { var diff = ee.Number(image.date().difference(targetDate, 'day') ).abs();return image.set('date_difference', diff);}) .sort('date_difference').first().clip(buffer);
Map.addLayer( nearest, {bands: ['B4', 'B3', 'B2'], min: 0, max: 0.3},'Nearest S2 Image',0);

// Print image information
print('Nearest Sentinel-2 image:', nearest);
print( 'Image date:', ee.Date(nearest.get('system:time_start')).format('YYYY-MM-dd'));
//Index calc
var ndvi =nearest .normalizedDifference(['B8','B4']).rename('NDVI');
var mndwi=nearest.normalizedDifference(['B3','B11']).rename('NDWI');
var ndsi=nearest.normalizedDifference(['B3','B11']).rename('NDSI');
Map.addLayer( ndvi,{ min: -0.1, max: 0.4,palette: ['blue','grey', 'black','black', 'green','green','darkgreen' ]},'NDVI ',0);
// Map.addLayer( mndwi,{ min: -0.1, max: 0.4,palette: ['darkgreen', ]},'M-NDWI ',0);
//DEM details
var srtm = ee.Image('USGS/SRTMGL1_003');
// var slope = ee.Terrain.slope(srtm);
var elevation = srtm.select('elevation');
// Eg: river valley roof is ~4000m
var elevMask = elevation.gte(100).and(elevation.lte(4000));
//Water Mask(change the paramters of mndwi/ndvi to accurately delineate the river boundary)
var water = ndvi.lt(0.2).and(mndwi.gt(-0.1)).and(ndsi.lt(0.5)).updateMask(elevMask);
var waterBoundary = water.selfMask() .reduceToVectors({geometry: buffer, scale: 6, geometryType: 'polygon', eightConnected: true, labelProperty: 'water',  maxPixels: 1e13});
Map.addLayer(water.selfMask(),{palette:['blue']},'WaterBoundary');
//export results
Export.table.toDrive({
  collection: waterBoundary,
  description:'LISS4_River_Water_Boundary_16Apr2025',
  folder: 'GEE_Exports',
  fileNamePrefix:  'LISS4_River_Water_Boundary_16Apr2025',
  fileFormat:   'KML'
});

// ===================================================================================
// BUILDING FOOTPRINT EXTRACTION WITHIN BUFFER
//Google building dataset : change the version(v3) to get time series data
var buildings = ee.FeatureCollection('GOOGLE/Research/open-buildings/v3/polygons').filterBounds(buffer);
print('Google Open Buildings:', buildings.limit(20));
var buildingsInBuffer = buildings;
print('Number of buildings in buffer:',buildingsInBuffer.size());

// Add building area in square metres.
var buildingsWithArea = buildingsInBuffer.map(function(feature) {var area = feature.geometry().area();return feature.set('area_m2',area  );});
//Building area
print(  'Buildings with area:',buildingsWithArea);
var totalBuildingArea = buildingsWithArea.aggregate_sum('area_m2');
print('Total building area (m²):',totalBuildingArea);

// Create a sequential ID for each building.
var buildingsWithID = ee.FeatureCollection(  buildingsWithArea.map(function(feature) {var id = feature.get('system:index');return feature.set('Building_ID',id);}));
Map.addLayer( buildingsWithID,{ color: 'yellow' }, 'Final Building Footprints');
//export buildingfootprint
Export.table.toDrive({
  collection: buildingsWithID,
  description: 'Building_Footprints_Buffer_KML',
  folder: 'GEE_Buildings',
  fileNamePrefix: 'Building_Footprints_Buffer',
  fileFormat: 'KML'
});
Map.addLayer(geometry2,{color: 'yellow'},'Ground Zero');
