@echo off
echo Starting database sync from production...

echo Creating backup of current dev database...
"C:\Program Files\MySQL\MySQL Server 9.1\bin\mysqldump.exe" -u root -p pools > dev_backup_before_sync_%date:~-4,4%%date:~-10,2%%date:~-7,2%.sql

echo Exporting production database...
"C:\Program Files\MySQL\MySQL Server 9.1\bin\mysqldump.exe" -h crossover.proxy.rlwy.net -P 57422 -u root -ptKqLsyPIriDGgrBIrRWqaLMWsEicmSso --single-transaction --routines --triggers railway > temp_production_export.sql

echo Replacing local dev database...
"C:\Program Files\MySQL\MySQL Server 9.1\bin\mysql.exe" -u root -p -e "DROP DATABASE IF EXISTS pools;"
"C:\Program Files\MySQL\MySQL Server 9.1\bin\mysql.exe" -u root -p -e "CREATE DATABASE pools;"
"C:\Program Files\MySQL\MySQL Server 9.1\bin\mysql.exe" -u root -p pools < temp_production_export.sql

echo Cleaning up temporary files...
del temp_production_export.sql

echo Database sync completed! Your local pools is now synced with production.
pause