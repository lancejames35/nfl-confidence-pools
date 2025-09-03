// Reset password for lance@leaguestation.com
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function resetMyPassword() {
    try {
        const connection = await mysql.createConnection({
            host: process.env.DATABASE_HOST || 'localhost',
            port: process.env.DATABASE_PORT || 3306,
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            database: process.env.DATABASE_NAME || 'pools'
        });

        console.log('✅ Connected to database');

        // Set a simple temporary password
        const newPassword = 'temp123';
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // Update the password
        const [result] = await connection.execute(
            'UPDATE users SET password_hash = ? WHERE email = ?',
            [hashedPassword, 'lance@leaguestation.com']
        );

        if (result.affectedRows > 0) {
            console.log('\n✅ Password reset successfully!');
            console.log('Email: lance@leaguestation.com');
            console.log('New Password: temp123');
            console.log('\n🔐 You can now sign in with this temporary password');
            console.log('💡 Remember to change it to something secure after logging in');
        } else {
            console.log('\n❌ No user found with that email address');
        }

        await connection.end();
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

resetMyPassword();