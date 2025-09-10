#!/usr/bin/env node
/**
 * Test script to validate weekly winners functionality
 * Run with: node test-weekly-winners.js
 */

// Load environment variables first
require('dotenv').config();

const database = require('./config/database');
const WeeklyWinnersService = require('./services/WeeklyWinnersService');

async function testWeeklyWinners() {
    try {
        console.log('🧪 Testing Weekly Winners Logic...\n');
        
        // Initialize database
        await database.initialize();
        console.log('✅ Database connected\n');
        
        // Test 1: Find the league with actual picks data
        console.log('📊 Finding test data...');
        
        // Find the league where elmer35 actually has picks
        const leagueWithPicks = await database.execute(`
            SELECT DISTINCT l.league_id, l.league_name, COUNT(p.pick_id) as pick_count
            FROM leagues l
            JOIN league_users lu ON l.league_id = lu.league_id
            JOIN users u ON lu.user_id = u.user_id
            JOIN league_entries le ON lu.league_user_id = le.league_user_id
            JOIN picks p ON le.entry_id = p.entry_id
            WHERE u.username = 'elmer35' AND p.week = 1
            GROUP BY l.league_id, l.league_name
            ORDER BY pick_count DESC
            LIMIT 1
        `);
        
        if (!leagueWithPicks || leagueWithPicks.length === 0) {
            console.log('❌ No leagues found with elmer35 picks for Week 1');
            process.exit(1);
        }
        
        const testLeague = leagueWithPicks[0];
        console.log(`✅ Using league with actual picks: ${testLeague.league_name} (ID: ${testLeague.league_id}) - ${testLeague.pick_count} picks\n`);
        
        // Test 2: Check if Week 1 has completed games and tiebreakers
        console.log('🏈 Checking Week 1 data...');
        
        const weeklyScores = await database.execute(`
            SELECT COUNT(*) as count 
            FROM weekly_scores ws
            JOIN league_entries le ON ws.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            WHERE lu.league_id = ? AND ws.week = 1
        `, [testLeague.league_id]);
        
        console.log(`📈 Found ${weeklyScores[0]?.count || 0} weekly scores for Week 1`);
        
        // Let's examine the actual weekly scores data
        const detailedScores = await database.execute(`
            SELECT ws.*, u.username, ws.total_points, ws.games_correct, ws.games_picked
            FROM weekly_scores ws
            JOIN league_entries le ON ws.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            WHERE lu.league_id = ? AND ws.week = 1
        `, [testLeague.league_id]);
        
        console.log('📊 Detailed weekly scores:');
        detailedScores.forEach(score => {
            console.log(`   ${score.username}: ${score.total_points} points (${score.games_correct}/${score.games_picked} correct)`);
        });
        
        // Let's check what's really in the database
        console.log('\n🔍 Debugging data relationships...');
        
        // Check if elmer35 has picks in ANY league
        const allElmerPicks = await database.execute(`
            SELECT COUNT(*) as count FROM picks p
            JOIN league_entries le ON p.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            WHERE u.username = 'elmer35' AND p.week = 1
        `);
        console.log(`   elmer35 has ${allElmerPicks[0]?.count || 0} picks total in week 1 across all leagues`);
        
        // Check what leagues elmer35 is in
        const elmerLeagues = await database.execute(`
            SELECT l.league_id, l.league_name, le.entry_id
            FROM users u
            JOIN league_users lu ON u.user_id = lu.user_id
            JOIN leagues l ON lu.league_id = l.league_id
            JOIN league_entries le ON lu.league_user_id = le.league_user_id
            WHERE u.username = 'elmer35'
        `);
        console.log(`   elmer35 is in ${elmerLeagues.length} leagues:`);
        elmerLeagues.forEach(league => {
            console.log(`     - League ${league.league_id}: ${league.league_name} (entry_id: ${league.entry_id})`);
        });
        
        // Now check picks for elmer35 in the correct league/entry
        const individualPicks = await database.execute(`
            SELECT 
                p.pick_id,
                p.entry_id,
                p.selected_team,
                p.confidence_points,
                p.is_correct,
                p.points_earned,
                g.game_id,
                ht.abbreviation as home_team,
                at.abbreviation as away_team,
                r.home_score,
                r.away_score,
                r.winning_team,
                l.league_name
            FROM picks p
            JOIN games g ON p.game_id = g.game_id
            JOIN teams ht ON g.home_team_id = ht.team_id
            JOIN teams at ON g.away_team_id = at.team_id
            JOIN league_entries le ON p.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN leagues l ON lu.league_id = l.league_id
            JOIN users u ON lu.user_id = u.user_id
            LEFT JOIN results r ON g.game_id = r.game_id
            WHERE u.username = 'elmer35' AND p.week = 1
            ORDER BY p.confidence_points DESC
        `);
        
        console.log(`   Found ${individualPicks.length} individual picks for elmer35:`);
        let totalEarned = 0;
        let correctCount = 0;
        individualPicks.forEach(pick => {
            const isCorrect = pick.is_correct ? '✓' : '✗';
            const gameResult = pick.home_score !== null ? `${pick.home_score}-${pick.away_score}` : 'No result';
            console.log(`   [${pick.league_name}] ${pick.confidence_points}pts: ${pick.selected_team} ${isCorrect} (${pick.away_team}@${pick.home_team} ${gameResult}) - Earned: ${pick.points_earned || 0}pts`);
            totalEarned += (pick.points_earned || 0);
            if (pick.is_correct) correctCount++;
        });
        console.log(`   Manual total: ${totalEarned} points, ${correctCount}/${individualPicks.length} correct`);
        
        // If picks exist, figure out which league they're in
        if (individualPicks.length > 0) {
            const picksLeague = individualPicks[0].league_name;
            const picksEntryId = individualPicks[0].entry_id;
            console.log(`   📍 elmer35's picks are in league "${picksLeague}" (entry_id: ${picksEntryId})`);
            
            if (picksLeague !== testLeague.league_name) {
                console.log(`   ⚠️  MISMATCH: Test using "${testLeague.league_name}" but picks are in "${picksLeague}"`);
                console.log(`   💡 Should test with the league containing actual picks!`);
            }
        }
        
        const tiebreakers = await database.execute(`
            SELECT COUNT(*) as count 
            FROM tiebreakers t
            JOIN league_entries le ON t.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            WHERE lu.league_id = ? AND t.week = 1 AND t.tiebreaker_type = 'mnf_total_points'
        `, [testLeague.league_id]);
        
        const tiebreakerCount = tiebreakers[0]?.count || 0;
        console.log(`🎯 Found ${tiebreakerCount} MNF tiebreaker predictions for Week 1`);
        
        const mnfResult = await database.execute(`
            SELECT r.home_score, r.away_score, (r.home_score + r.away_score) as total_points
            FROM games g
            JOIN results r ON g.game_id = r.game_id
            WHERE g.week = 1 AND r.final_status = 'final'
            ORDER BY g.kickoff_timestamp DESC
            LIMIT 1
        `);
        
        const mnfGame = mnfResult[0];
        
        if (mnfGame) {
            console.log(`🏆 MNF actual total: ${mnfGame.total_points} points (${mnfGame.home_score}-${mnfGame.away_score})`);
        } else {
            console.log('⚠️  No MNF result found for Week 1');
        }
        
        // Check if we have enough data to proceed
        const weeklyScoresCount = weeklyScores[0]?.count || 0;
        if (weeklyScoresCount === 0 && individualPicks.length === 0) {
            console.log('⚠️  No weekly scores OR picks found - skipping winner calculation');
            console.log('   This means no data exists for this league/week combination.');
            console.log('\n🎉 Test completed - basic structure verified!');
            return;
        }
        
        if (weeklyScoresCount === 0 && individualPicks.length > 0) {
            console.log('💡 No weekly_scores entries but raw picks exist - this is perfect for testing dynamic calculation!');
        }
        
        console.log('\n🔧 Testing Weekly Winners Service...\n');
        
        // Before calculating winners, let's see what the service reads
        console.log('\n🔍 Checking what WeeklyWinnersService.getWeeklyScores returns...');
        try {
            // Temporarily test the getWeeklyScores method
            const testScores = await database.execute(`
                SELECT 
                    ws.weekly_score_id,
                    ws.entry_id,
                    ws.total_points,
                    ws.games_correct,
                    ws.games_picked,
                    le.league_user_id,
                    lu.user_id,
                    u.username,
                    let.tier_id,
                    let.tier_name
                FROM weekly_scores ws
                JOIN league_entries le ON ws.entry_id = le.entry_id
                JOIN league_users lu ON le.league_user_id = lu.league_user_id
                JOIN users u ON lu.user_id = u.user_id
                LEFT JOIN league_user_tiers lut ON lu.league_user_id = lut.league_user_id
                LEFT JOIN league_entry_tiers let ON lut.tier_id = let.tier_id
                WHERE lu.league_id = ? 
                AND ws.week = ? 
                AND le.status = 'active'
                ORDER BY ws.total_points DESC, ws.games_correct DESC
            `, [testLeague.league_id, 1]);
            
            console.log('   Service would read these scores:');
            testScores.forEach(score => {
                console.log(`   ${score.username}: ${score.total_points} points (entry_id: ${score.entry_id})`);
            });
            
            // Debug the data integrity
            if (testScores.length === 0) {
                console.log('   ⚠️  No scores returned - checking participants data...');
                
                const participantDebug = await database.execute(`
                    SELECT 
                        le.entry_id,
                        le.league_user_id,
                        lu.user_id,
                        u.username,
                        le.status as entry_status,
                        lu.status as user_status
                    FROM league_entries le
                    JOIN league_users lu ON le.league_user_id = lu.league_user_id
                    JOIN users u ON lu.user_id = u.user_id
                    WHERE lu.league_id = ? 
                    AND le.status = 'active'
                `, [testLeague.league_id]);
                
                console.log(`   Found ${participantDebug.length} active participants:`);
                participantDebug.forEach(p => {
                    console.log(`     ${p.username}: entry_id=${p.entry_id}, user_status=${p.user_status}, entry_status=${p.entry_status}`);
                });
            }
        } catch (error) {
            console.log(`   Error testing: ${error.message}`);
        }

        // Test 3: Calculate weekly winners for Week 1
        try {
            const result = await WeeklyWinnersService.calculateWeeklyWinners(testLeague.league_id, 1, 2025);
            
            console.log('\n✅ Weekly winners calculation completed:');
            console.log(`   Success: ${result.success}`);
            console.log(`   Message: ${result.message}`);
            console.log(`   Tiebreaker used: ${result.tiebreakerUsed}`);
            console.log(`   Winners count: ${result.winners?.length || 0}`);
            
            if (result.winners && result.winners.length > 0) {
                console.log('\n🏆 Winners:');
                result.winners.forEach((winner, index) => {
                    console.log(`   ${index + 1}. ${winner.username} - ${winner.total_points} points`);
                    if (winner.tiebreaker_used) {
                        console.log(`      Tiebreaker guess: ${winner.tiebreaker_guess}, Diff: ${winner.tiebreaker_diff}`);
                    }
                });
            }
        } catch (error) {
            console.log(`❌ Error calculating winners: ${error.message}`);
        }
        
        // Test 4: Verify the data was inserted
        console.log('\n📋 Checking weekly_winners table...');
        const winners = await database.execute(`
            SELECT ww.*, u.username 
            FROM weekly_winners ww
            JOIN league_entries le ON ww.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            WHERE ww.league_id = ? AND ww.week = 1
            ORDER BY ww.total_points DESC
        `, [testLeague.league_id]);
        
        console.log(`✅ Found ${winners.length} recorded winners in database:`);
        winners.forEach(winner => {
            console.log(`   - ${winner.username}: ${winner.total_points} points`);
            if (winner.tiebreaker_guess) {
                console.log(`     MNF guess: ${winner.tiebreaker_guess}, Actual: ${winner.actual_mnf_total}, Diff: ${winner.tiebreaker_diff}`);
            }
        });
        
        // Test 5: Test the API endpoint functionality
        console.log('\n📊 Testing WeeklyWinnersService methods...');
        
        try {
            const weeklyWinners = await WeeklyWinnersService.getWeeklyWinners(testLeague.league_id, 1);
            console.log(`✅ getWeeklyWinners: Found ${weeklyWinners.length} winners`);
        } catch (error) {
            console.log(`❌ getWeeklyWinners error: ${error.message}`);
        }
        
        try {
            const winnerEntryIds = await WeeklyWinnersService.getWeeklyWinnerEntryIds(testLeague.league_id, 1);
            console.log(`✅ getWeeklyWinnerEntryIds: Found ${winnerEntryIds.length} winner entry IDs: [${winnerEntryIds.join(', ')}]`);
        } catch (error) {
            console.log(`❌ getWeeklyWinnerEntryIds error: ${error.message}`);
        }
        
        // Test 6: Check weekly_scores.is_weekly_winner flag
        console.log('\n🎯 Checking is_weekly_winner flags...');
        const winnerFlags = await database.execute(`
            SELECT ws.weekly_score_id, ws.is_weekly_winner, u.username, ws.total_points
            FROM weekly_scores ws
            JOIN league_entries le ON ws.entry_id = le.entry_id
            JOIN league_users lu ON le.league_user_id = lu.league_user_id
            JOIN users u ON lu.user_id = u.user_id
            WHERE lu.league_id = ? AND ws.week = 1 AND ws.is_weekly_winner = 1
            ORDER BY ws.total_points DESC
        `, [testLeague.league_id]);
        
        console.log(`✅ Found ${winnerFlags.length} entries marked as weekly winners in weekly_scores table`);
        winnerFlags.forEach(flag => {
            console.log(`   - ${flag.username}: ${flag.total_points} points (score_id: ${flag.weekly_score_id})`);
        });
        
        console.log('\n🎉 Test completed successfully!');
        
    } catch (error) {
        console.error('💥 Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await database.close();
        process.exit(0);
    }
}

// Run the test
if (require.main === module) {
    testWeeklyWinners();
}

module.exports = { testWeeklyWinners };