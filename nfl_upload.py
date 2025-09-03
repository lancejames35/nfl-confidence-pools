#!/usr/bin/env python3
"""
NFL Games Upload Script
Uploads NFL schedule data from Excel file to MySQL database

Requirements:
pip install pandas openpyxl pymysql pytz

Usage:
python nfl_upload.py path/to/nfl_schedule.xlsx
"""

import sys
import pandas as pd
import pymysql
from datetime import datetime, timezone
import pytz
import os

# =============================================================================
# DATABASE CONFIGURATION - UPDATE THESE VALUES
# =============================================================================
DB_CONFIG = {
    'host': 'localhost',           # Your MySQL host
    'user': 'root',                # Your MySQL username
    'password': 'Iceman3500!',   # Your MySQL password
    'database': 'pools',           # Your database name
    'charset': 'utf8mb4'
}

# For Railway MySQL (hosted database), use format like:
# DB_CONFIG = {
#     'host': 'roundhouse.proxy.rlwy.net',
#     'port': 12345,
#     'user': 'root',
#     'password': 'your_railway_password',
#     'database': 'railway',
#     'charset': 'utf8mb4'
# }
# =============================================================================

def validate_excel_columns(df):
    """Validate that all required columns exist in the Excel file"""
    required_columns = [
        'nfl_game_id', 'season_year', 'week', 'game_type', 
        'home_team_id', 'home_team', 'away_team_id', 'away_team',
        'game_date', 'game_time_et'
    ]
    
    missing_columns = [col for col in required_columns if col not in df.columns]
    if missing_columns:
        raise ValueError(f"Missing required columns: {missing_columns}")
    
    print(f"✓ Excel file has all required columns")
    return True

def validate_game_types(df):
    """Validate game_type values"""
    valid_types = ['regular', 'wildcard', 'divisional', 'conference', 'superbowl']
    invalid_types = df[~df['game_type'].isin(valid_types)]['game_type'].unique()
    
    if len(invalid_types) > 0:
        raise ValueError(f"Invalid game_type values: {invalid_types}. Must be one of: {valid_types}")
    
    print(f"✓ All game types are valid")
    return True

def get_team_lookup(connection):
    """Create a dictionary mapping team abbreviations to team_ids"""
    cursor = connection.cursor()
    cursor.execute("SELECT team_id, abbreviation FROM teams WHERE active = TRUE")
    team_lookup = {abbr: team_id for team_id, abbr in cursor.fetchall()}
    cursor.close()
    
    print(f"✓ Loaded {len(team_lookup)} teams for lookup")
    return team_lookup

def validate_teams_exist(df, team_lookup):
    """Validate that team_ids exist and abbreviations match"""
    # Create reverse lookup (team_id -> abbreviation)
    team_id_lookup = {team_id: abbr for abbr, team_id in team_lookup.items()}
    
    errors = []
    
    # Check all home teams
    for index, row in df.iterrows():
        home_team_id = int(row['home_team_id'])
        home_team_abbr = row['home_team']
        
        if home_team_id not in team_id_lookup:
            errors.append(f"Row {index + 2}: Home team_id {home_team_id} not found in database")
        elif team_id_lookup[home_team_id] != home_team_abbr:
            errors.append(f"Row {index + 2}: Home team_id {home_team_id} doesn't match abbreviation '{home_team_abbr}' (should be '{team_id_lookup[home_team_id]}')")
        
        # Check away teams
        away_team_id = int(row['away_team_id'])
        away_team_abbr = row['away_team']
        
        if away_team_id not in team_id_lookup:
            errors.append(f"Row {index + 2}: Away team_id {away_team_id} not found in database")
        elif team_id_lookup[away_team_id] != away_team_abbr:
            errors.append(f"Row {index + 2}: Away team_id {away_team_id} doesn't match abbreviation '{away_team_abbr}' (should be '{team_id_lookup[away_team_id]}')")
    
    if errors:
        print("❌ Team validation errors:")
        for error in errors[:10]:  # Show first 10 errors
            print(f"   {error}")
        if len(errors) > 10:
            print(f"   ... and {len(errors) - 10} more errors")
        raise ValueError(f"Found {len(errors)} team validation errors")
    
    print(f"✓ All team IDs and abbreviations are valid")
    return True

def calculate_kickoff_timestamp(row):
    """Calculate kickoff timestamp from date and time (assuming Eastern Time)"""
    try:
        # Parse the date
        game_date = pd.to_datetime(row['game_date']).date()
        
        # Handle game_time_et - could be string or time object
        game_time_value = row['game_time_et']
        if isinstance(game_time_value, str):
            # If it's a string, parse it
            game_time = pd.to_datetime(game_time_value).time()
        else:
            # If it's already a time object, use it directly
            game_time = game_time_value
        
        # Use Eastern timezone (NFL standard)
        eastern_tz = pytz.timezone('America/New_York')
        
        # Combine date and time
        naive_datetime = datetime.combine(game_date, game_time)
        
        # Localize to Eastern Time, then convert to UTC
        localized_datetime = eastern_tz.localize(naive_datetime)
        utc_datetime = localized_datetime.astimezone(pytz.UTC)
        
        return utc_datetime
    except Exception as e:
        print(f"Error calculating kickoff for game {row['nfl_game_id']}: {e}")
        print(f"  game_date: {row['game_date']} (type: {type(row['game_date'])})")
        print(f"  game_time_et: {row['game_time_et']} (type: {type(row['game_time_et'])})")
        return None

def connect_to_database():
    """Establish database connection"""
    try:
        connection = pymysql.connect(**DB_CONFIG)
        print(f"✓ Connected to database: {DB_CONFIG['database']}")
        return connection
    except Exception as e:
        print(f"❌ Database connection failed: {e}")
        raise

def upload_games_to_database(df, connection):
    """Upload games data to MySQL database using team IDs from Excel"""
    
    insert_query = """
    INSERT INTO games (
        nfl_game_id, season_year, week, game_type, home_team_id, away_team_id, 
        game_date, game_time, kickoff_timestamp, status
    ) VALUES (
        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
    )
    """
    
    cursor = connection.cursor()
    success_count = 0
    error_count = 0
    errors = []
    
    try:
        for index, row in df.iterrows():
            try:
                # Calculate kickoff timestamp
                kickoff_timestamp = calculate_kickoff_timestamp(row)
                
                if kickoff_timestamp is None:
                    error_count += 1
                    errors.append(f"Row {index + 2}: Could not calculate kickoff timestamp")
                    continue
                
                # Get team IDs directly from Excel
                home_team_id = int(row['home_team_id'])
                away_team_id = int(row['away_team_id'])
                
                # Prepare data for insertion
                data = (
                    row['nfl_game_id'],
                    int(row['season_year']),
                    int(row['week']),
                    row['game_type'],
                    home_team_id,
                    away_team_id,
                    row['game_date'],
                    row['game_time_et'],
                    kickoff_timestamp,
                    'scheduled'  # Default status
                )
                
                # Execute insert
                cursor.execute(insert_query, data)
                success_count += 1
                
            except Exception as e:
                error_count += 1
                errors.append(f"Row {index + 2} ({row['nfl_game_id']}): {str(e)}")
                continue
        
        # Commit all successful insertions
        connection.commit()
        
        # Print results
        print(f"\n📊 Upload Results:")
        print(f"✅ Successfully uploaded: {success_count} games")
        if error_count > 0:
            print(f"❌ Errors encountered: {error_count} games")
            print(f"\nError details:")
            for error in errors[:10]:  # Show first 10 errors
                print(f"  • {error}")
            if len(errors) > 10:
                print(f"  ... and {len(errors) - 10} more errors")
        
        return success_count, error_count
        
    except Exception as e:
        connection.rollback()
        print(f"❌ Database transaction failed: {e}")
        raise
    finally:
        cursor.close()

def main():
    if len(sys.argv) != 2:
        print("Usage: python nfl_upload.py <path_to_excel_file>")
        print("Example: python nfl_upload.py nfl_schedule_2025.xlsx")
        sys.exit(1)
    
    excel_file_path = sys.argv[1]
    
    try:
        # Check if file exists
        if not os.path.exists(excel_file_path):
            print(f"❌ File not found: {excel_file_path}")
            sys.exit(1)
        
        print(f"🏈 Starting NFL Games Upload")
        print(f"📁 Reading file: {excel_file_path}")
        
        # Read Excel file
        df = pd.read_excel(excel_file_path)
        print(f"📋 Found {len(df)} games in Excel file")
        
        # Validate data
        validate_excel_columns(df)
        validate_game_types(df)
        
        # Connect to database
        connection = connect_to_database()
        
        # Get team lookup and validate teams exist
        team_lookup = get_team_lookup(connection)
        validate_teams_exist(df, team_lookup)
        
        # Upload data
        success_count, error_count = upload_games_to_database(df, connection)
        
        # Close database connection
        connection.close()
        print(f"✓ Database connection closed")
        
        # Final summary
        print(f"\n🎯 Final Summary:")
        print(f"   Total games processed: {len(df)}")
        print(f"   Successfully uploaded: {success_count}")
        print(f"   Errors: {error_count}")
        
        if error_count == 0:
            print(f"🎉 All games uploaded successfully!")
        else:
            print(f"⚠️  Upload completed with some errors. Please review the error details above.")
        
    except Exception as e:
        print(f"❌ Upload failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()