require('dotenv').config();
const database = require('./config/database');
const WeeklyWinnersService = require('./services/WeeklyWinnersService');

async function runWeeklyWinners() {
    try {
        console.log('🔧 Initializing database...');
        await database.initialize();
        
        console.log('🚀 Running weekly winners calculation for League 8, Week 1...');
        const result = await WeeklyWinnersService.calculateWeeklyWinners(8, 1, 2025);
        
        console.log('✅ SUCCESS! Result:');
        console.log(JSON.stringify(result, null, 2));
        
        if (result.success) {
            console.log('\n🎉 Weekly winners calculated successfully!');
            console.log(`🏆 Winners: ${result.winners.map(w => w.username).join(', ')}`);
            console.log(`🎯 Tiebreaker used: ${result.tiebreakerUsed ? 'Yes' : 'No'}`);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        process.exit(0);
    }
}

runWeeklyWinners();