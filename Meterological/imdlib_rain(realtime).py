
# ================================================================
# INTERACTIVE IMD DAILY RAINFALL EXTRACTION
# STATE / DISTRICT / TEHSIL LEVEL
#
# Author: Bala Sabarish
# Data: IMD 0.25 Degree Daily Gridded Rainfall
# Library: imdlib
#
# FEATURES:
# 1. Read administrative shapefile
# 2. Automatically detect administrative fields
# 3. List and select states, districts and tehsils
# 4. Download last 3 completed months of IMD rainfall
# 5. Extract rainfall for selected polygons
# 6. Generate daily, monthly and cumulative outputs
# ================================================================


# ================================================================
# 1. INSTALL LIBRARIES
# ================================================================

import sys
import subprocess
import importlib.util

packages = {
    "geopandas": "geopandas",
    "imdlib": "imdlib",
    "numpy": "numpy",
    "pandas": "pandas",
    "xarray": "xarray",
    "shapely": "shapely",
    "openpyxl": "openpyxl",
    "matplotlib": "matplotlib"
}

for module, package in packages.items():
    if importlib.util.find_spec(module) is None:
        subprocess.check_call([
            sys.executable, "-m", "pip", "install", package
        ])

print("All packages ready.")


# ================================================================
# 2. IMPORT LIBRARIES
# ================================================================

import os
import warnings
import zipfile
from pathlib import Path

import geopandas as gpd
import imdlib as imd
import pandas as pd
import numpy as np

from shapely.geometry import Point

warnings.filterwarnings("ignore")


# ================================================================
# 3. USER CONFIGURATION
# ================================================================

# Upload / provide the shapefile path
SHAPEFILE = r"district.zip"

# For ZIP shapefile, use:
# SHAPEFILE = r"D:\GIS\Tamil_Nadu_Boundaries.zip"

FILE_DIR = "./imd_data"
OUTPUT_DIR = "./IMD_Rainfall_Results"

os.makedirs(FILE_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ================================================================
# 4. AUTOMATIC LAST THREE COMPLETED MONTHS
# ================================================================

TODAY = pd.Timestamp.today().normalize()

# Last completed calendar month
END_DATE = TODAY.replace(day=1) - pd.Timedelta(days=1)

# First day of the three-month period
START_DATE = (
    END_DATE.replace(day=1) - pd.DateOffset(months=2)
)

START_DATE = START_DATE.strftime("%Y-%m-%d")
END_DATE = END_DATE.strftime("%Y-%m-%d")

print("\nRAINFALL PERIOD")
print("-------------------------------")
print("Start:", START_DATE)
print("End:", END_DATE)


# ================================================================
# 5. READ SHAPEFILE
# ================================================================

shp_path = Path(SHAPEFILE)

if not shp_path.exists():
    raise FileNotFoundError(f"Shapefile not found: {SHAPEFILE}")

# Extract ZIP if necessary
if shp_path.suffix.lower() == ".zip":

    extract_folder = Path("./Extracted_Boundaries")
    extract_folder.mkdir(exist_ok=True)

    with zipfile.ZipFile(shp_path, "r") as z:
        z.extractall(extract_folder)

    shp_files = list(extract_folder.rglob("*.shp"))

    if not shp_files:
        raise ValueError("No shapefile found inside ZIP.")

    if len(shp_files) > 1:
        raise ValueError(
            "Multiple shapefiles found. Specify the required "
            "shapefile separately."
        )

    shp_path = shp_files[0]

gdf = gpd.read_file(shp_path)

if gdf.empty:
    raise ValueError("Shapefile contains no features.")

if gdf.crs is None:
    raise ValueError("Shapefile CRS is missing.")

gdf = gdf.to_crs("EPSG:4326")

print("\nSHAPEFILE INFORMATION")
print("-------------------------------")
print("Total polygons:", len(gdf))
print("Available fields:", list(gdf.columns))


# ================================================================
# 6. AUTOMATIC ADMINISTRATIVE FIELD DETECTION
# ================================================================

# Detect common names irrespective of capitalization

field_lookup = {
    str(col).lower().strip(): col
    for col in gdf.columns
}

possible_fields = {
    "state": [
        "state", "state_name", "st_name",
        "statename", "province"
    ],

    "district": [
        "district", "district_name",
        "dist_name", "districtname"
    ],

    "tehsil": [
        "tehsil", "taluk", "taluka",
        "subdistrict", "sub_district",
        "subdistrict_name", "mandal"
    ]
}

detected = {}

for level, names in possible_fields.items():

    for name in names:

        if name in field_lookup:
            detected[level] = field_lookup[name]
            break

print("\nDETECTED ADMINISTRATIVE FIELDS")
print("-------------------------------")

for level, field in detected.items():
    print(f"{level.upper()} : {field}")

if not detected:
    raise ValueError(
        "No state/district/tehsil field detected. "
        "Check your shapefile column names."
    )


# ================================================================
# 7. SELECT ADMINISTRATIVE LEVEL
# ================================================================

levels = list(detected.keys())

print("\nAVAILABLE ADMINISTRATIVE LEVELS")
print("-------------------------------")

for i, level in enumerate(levels, 1):
    print(f"{i}. {level.upper()}")

choice = int(input("\nSelect administrative level: "))

if choice < 1 or choice > len(levels):
    raise ValueError("Invalid administrative level.")

selected_level = levels[choice - 1]
target_field = detected[selected_level]

print("\nSelected level:", selected_level.upper())


# ================================================================
# 8. CLEAN GEOMETRIES AND ATTRIBUTES
# ================================================================

gdf = gdf[
    gdf.geometry.notna()
    & ~gdf.geometry.is_empty
].copy()

# Repair invalid geometries
gdf["geometry"] = gdf.geometry.buffer(0)

gdf = gdf[
    gdf.geometry.notna()
    & ~gdf.geometry.is_empty
].copy()

for level, field in detected.items():
    gdf[field] = gdf[field].astype(str).str.strip()

# Remove missing target names
gdf = gdf[
    gdf[target_field].notna()
    & gdf[target_field].ne("")
    & gdf[target_field].str.lower().ne("nan")
].copy()


# ================================================================
# 9. FILTER PARENT ADMINISTRATIVE AREAS
# ================================================================

# If district or tehsil data is available,
# allow filtering by state.

if selected_level in ["district", "tehsil"]:

    if "state" in detected:

        state_field = detected["state"]

        states = sorted(
            gdf[state_field].dropna().unique().tolist()
        )

        print("\nAVAILABLE STATES")
        print("-------------------------------")

        for i, state in enumerate(states, 1):
            print(f"{i}. {state}")

        state_choice = input(
            "\nEnter state number (0 = all states): "
        ).strip()

        if state_choice != "0":

            idx = int(state_choice) - 1

            if idx < 0 or idx >= len(states):
                raise ValueError("Invalid state selection.")

            selected_state = states[idx]

            gdf = gdf[
                gdf[state_field] == selected_state
            ].copy()

            print("Selected state:", selected_state)


# If tehsil is selected, optionally filter by district

if selected_level == "tehsil" and "district" in detected:

    district_field = detected["district"]

    districts = sorted(
        gdf[district_field].dropna().unique().tolist()
    )

    print("\nAVAILABLE DISTRICTS")
    print("-------------------------------")

    for i, district in enumerate(districts, 1):
        print(f"{i}. {district}")

    district_choice = input(
        "\nEnter district number (0 = all districts): "
    ).strip()

    if district_choice != "0":

        idx = int(district_choice) - 1

        if idx < 0 or idx >= len(districts):
            raise ValueError("Invalid district selection.")

        selected_district = districts[idx]

        gdf = gdf[
            gdf[district_field] == selected_district
        ].copy()

        print("Selected district:", selected_district)


# ================================================================
# 10. LIST AND SELECT TARGET REGIONS
# ================================================================

region_names = sorted(
    gdf[target_field].dropna().unique().tolist()
)

print("\nAVAILABLE", selected_level.upper(), "AREAS")
print("=" * 45)

for i, name in enumerate(region_names, 1):
    print(f"{i}. {name}")

print("\nEnter:")
print("0 = All regions")
print("Specific numbers separated by commas = Selected regions")

region_choice = input("\nYour selection: ").strip()

if region_choice == "0":

    selected_names = region_names

else:

    indices = [
        int(x.strip()) - 1
        for x in region_choice.split(",")
    ]

    if any(i < 0 or i >= len(region_names) for i in indices):
        raise ValueError("Invalid region selection.")

    selected_names = [
        region_names[i] for i in indices
    ]

gdf = gdf[
    gdf[target_field].isin(selected_names)
].copy()

# Group by available parent fields to avoid
# merging same-named districts across states
group_fields = []

for level in ["state", "district", "tehsil"]:

    if level in detected and level in [
        "state", "district", "tehsil"
    ]:

        if level == selected_level or level in [
            "state", "district"
        ]:

            field = detected[level]

            if field not in group_fields:
                group_fields.append(field)

# Retain only relevant hierarchy fields
if selected_level == "state":
    group_fields = [detected["state"]]

elif selected_level == "district":
    group_fields = [
        detected[x] for x in ["state", "district"]
        if x in detected
    ]

elif selected_level == "tehsil":
    group_fields = [
        detected[x] for x in ["state", "district", "tehsil"]
        if x in detected
    ]

# Dissolve polygons by administrative identity
gdf = gdf.dissolve(
    by=group_fields,
    as_index=False
).reset_index(drop=True)

gdf["_region_id"] = np.arange(len(gdf))

print("\nSELECTED REGIONS")
print("-------------------------------")
print("Total regions:", len(gdf))
print(gdf[group_fields].to_string(index=False))


# ================================================================
# 11. DOWNLOAD IMD DAILY RAINFALL
# ================================================================

print("\nDownloading IMD daily rainfall...")
print("Please wait...")

imd.get_real_data(
    "rain",
    START_DATE,
    END_DATE,
    FILE_DIR
)

rainfall_dataset = imd.open_real_data(
    "rain",
    START_DATE,
    END_DATE,
    FILE_DIR
).get_xarray()

print("\nIMD DATASET")
print("-------------------------------")
print(rainfall_dataset)

if "rain" not in rainfall_dataset.data_vars:
    raise ValueError(
        f"Rainfall variable not found. "
        f"Available: {list(rainfall_dataset.data_vars)}"
    )

rain_da = rainfall_dataset["rain"]

required_dims = {"time", "lat", "lon"}

if not required_dims.issubset(set(rain_da.dims)):
    raise ValueError(
        f"Unexpected rainfall dimensions: {rain_da.dims}"
    )

rain_da = rain_da.transpose("time", "lat", "lon")


# ================================================================
# 12. CREATE IMD GRID POINTS
# ================================================================

lats = np.asarray(rain_da["lat"].values)
lons = np.asarray(rain_da["lon"].values)

lon_grid, lat_grid = np.meshgrid(lons, lats)

grid_points = gpd.GeoDataFrame(
    {
        "grid_id": np.arange(
            lon_grid.size,
            dtype=np.int64
        )
    },

    geometry=[
        Point(lon, lat)
        for lon, lat in zip(
            lon_grid.ravel(),
            lat_grid.ravel()
        )
    ],

    crs="EPSG:4326"
)

print("\nTotal IMD grid points:", len(grid_points))


# ================================================================
# 13. MATCH IMD GRID POINTS WITH SELECTED POLYGONS
# ================================================================

print("\nMatching rainfall grid with administrative boundaries...")

joined = gpd.sjoin(
    grid_points,
    gdf[["_region_id", "geometry"]],
    how="inner",
    predicate="within"
).drop_duplicates(["_region_id", "grid_id"])

region_grid_ids = (
    joined.groupby("_region_id")["grid_id"]
    .apply(lambda x: x.to_numpy(dtype=np.int64))
    .to_dict()
)

print("Matched regions:", len(region_grid_ids))
print("Selected regions:", len(gdf))


# ================================================================
# 14. PREPARE RAINFALL ARRAY
# ================================================================

dates = pd.DatetimeIndex(
    pd.to_datetime(rain_da["time"].values)
).normalize()

rain = np.asarray(
    rain_da.values,
    dtype=np.float64
)

rain[~np.isfinite(rain)] = np.nan
rain[rain < 0] = np.nan

date_mask = (
    (dates >= pd.Timestamp(START_DATE))
    & (dates <= pd.Timestamp(END_DATE))
)

dates = dates[date_mask]
rain = rain[date_mask, :, :]

if len(dates) == 0:
    raise ValueError(
        "No rainfall data available for requested period."
    )

print("\nACTUAL IMD DATA PERIOD")
print("-------------------------------")
print("First date:", dates.min())
print("Last date:", dates.max())
print("Available days:", len(dates))

# Flatten spatial dimensions
rain_flat = rain.reshape(len(dates), -1)


# ================================================================
# 15. CALCULATE DAILY RAINFALL FOR EACH REGION
# ================================================================

daily_records = []

for _, row in gdf.iterrows():

    region_id = int(row["_region_id"])

    # Create readable administrative name
    region_label = " | ".join(
        str(row[field]) for field in group_fields
    )

    grid_ids = region_grid_ids.get(
        region_id,
        np.array([], dtype=np.int64)
    )

    if grid_ids.size == 0:

        daily_means = np.full(
            len(dates),
            np.nan
        )

    else:

        values = rain_flat[:, grid_ids]

        valid_counts = np.isfinite(values).sum(axis=1)

        daily_sums = np.nansum(values, axis=1)

        daily_means = np.divide(
            daily_sums,
            valid_counts,
            out=np.full(len(dates), np.nan),
            where=valid_counts > 0
        )

    for date, rainfall_value in zip(
        dates,
        daily_means
    ):

        record = {
            "Region": region_label,
            "Date": date,
            "Rainfall_mm": rainfall_value
        }

        for field in group_fields:
            record[field] = row[field]

        daily_records.append(record)


daily_long = pd.DataFrame(daily_records)

daily_long = daily_long.rename(
    columns={
        detected[level]: level.title()
        for level in detected
    }
)

daily_long = daily_long.sort_values(
    ["Region", "Date"]
).reset_index(drop=True)

print("\nDAILY RAINFALL PREVIEW")
print(daily_long.head(10))


# ================================================================
# 16. DAILY WIDE FORMAT
# ================================================================

daily_wide = daily_long.pivot(
    index="Date",
    columns="Region",
    values="Rainfall_mm"
)

daily_wide.index.name = "Date"


# ================================================================
# 17. CUMULATIVE RAINFALL SUMMARY
# ================================================================

summary = daily_long.groupby(
    "Region"
).agg(

    Cumulative_Rainfall_mm=(
        "Rainfall_mm",
        lambda x: x.sum(min_count=1)
    ),

    Mean_Daily_Rainfall_mm=(
        "Rainfall_mm",
        "mean"
    ),

    Maximum_Daily_Rainfall_mm=(
        "Rainfall_mm",
        "max"
    ),

    Minimum_Daily_Rainfall_mm=(
        "Rainfall_mm",
        "min"
    ),

    Valid_Days=(
        "Rainfall_mm",
        "count"
    ),

    Missing_Days=(
        "Rainfall_mm",
        lambda x: x.isna().sum()
    )

).reset_index()

summary = summary.sort_values(
    "Cumulative_Rainfall_mm",
    ascending=False
)


# ================================================================
# 18. MONTHLY CUMULATIVE RAINFALL
# ================================================================

monthly = daily_long.copy()

monthly["Month"] = (
    monthly["Date"].dt.to_period("M").astype(str)
)

monthly_rainfall = monthly.groupby(
    ["Region", "Month"]
)["Rainfall_mm"].sum(min_count=1).reset_index()

monthly_rainfall = monthly_rainfall.rename(
    columns={
        "Rainfall_mm": "Monthly_Cumulative_Rainfall_mm"
    }
)


# ================================================================
# 19. ADD ADMINISTRATIVE ATTRIBUTES TO SUMMARY
# ==============================================================

region_attributes = gdf[
    ["_region_id"] + group_fields
].copy()

region_attributes["Region"] = region_attributes[
    group_fields
].astype(str).agg(" | ".join, axis=1)

region_attributes = region_attributes.drop(
    columns="_region_id"
)

region_attributes = region_attributes.rename(
    columns={
        detected[level]: level.title()
        for level in detected
    }
)

summary = summary.merge(
    region_attributes,
    on="Region",
    how="left"
)


# ================================================================
# 20. EXPORT RESULTS
# ================================================================

output_path = Path(OUTPUT_DIR)

summary_file = output_path / "Cumulative_Rainfall.csv"
daily_file = output_path / "Daily_Rainfall_Wide.csv"
long_file = output_path / "Daily_Rainfall_Long.csv"
monthly_file = output_path / "Monthly_Rainfall.csv"
excel_file = output_path / "IMD_Rainfall_Complete.xlsx"

summary.to_csv(summary_file, index=False)

daily_wide.to_csv(daily_file)

daily_long.to_csv(long_file, index=False)

monthly_rainfall.to_csv(monthly_file, index=False)


# Excel export
with pd.ExcelWriter(
    excel_file,
    engine="openpyxl"
) as writer:

    summary.to_excel(
        writer,
        sheet_name="Cumulative_Summary",
        index=False
    )

    daily_wide.to_excel(
        writer,
        sheet_name="Daily_Wide"
    )

    daily_long.to_excel(
        writer,
        sheet_name="Daily_Long",
        index=False
    )

    monthly_rainfall.to_excel(
        writer,
        sheet_name="Monthly_Rainfall",
        index=False
    )


# ================================================================
# 21. FINAL REPORT
# ================================================================

print("\n" + "=" * 60)
print("IMD RAINFALL EXTRACTION COMPLETED")
print("=" * 60)

print("Administrative level:", selected_level.upper())
print("Total selected regions:", len(gdf))

print("Requested start:", START_DATE)
print("Requested end:", END_DATE)

print("Actual first date:", dates.min().date())
print("Actual last date:", dates.max().date())

print("\nCUMULATIVE RAINFALL SUMMARY")
print(summary.to_string(index=False))

print("\nOUTPUT FILES")

for file in output_path.iterdir():
    print(" -", file.resolve())

print("\nPROCESSING COMPLETE")

