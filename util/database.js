const {Client} = require("pg");
const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

let isConnected = false;

async function connectDatabase() {
    if (!isConnected) {
        try {
            await client.connect();
            console.log('Verbunden mit PostgreSQL');
            isConnected = true;
        } catch (err) {
            console.error('Fehler bei Datenbankverbindung:', err);
            throw err;
        }
    }
    return client;
}

// read all users for /users
async function readUsersFromDB(currentUserId, search = '') {
    try {
        const values = [`%${search}%`, currentUserId];
        const result =  await client.query(
            `SELECT u.*,
              EXISTS(SELECT 1 FROM follows 
               WHERE follower = $2
               AND followee = u.user_id) AS is_followed
               FROM users u
               WHERE u.user_id != $2
                AND u.name ILIKE $1
        
        ` ,values);


        return result.rows;
    } catch (err) {
        console.error('Fehler beim Lesen der Users:', err);
        throw err;
    }
}
//liest alle daten von diesem user für /profile
async function readUserProfile(userId) {
    try {
        const client = await connectDatabase();
        const result = await client.query(`SELECT u.*,
        (SELECT COUNT(*) FROM follows WHERE followee = u.user_id) AS follower_count,
        (SELECT COUNT(*) FROM follows WHERE follower = u.user_id) AS followee_count        
/* Count zählt die Anzahl für wie viele user einem user folgen und wie vielen usern der user folgt */
        FROM users u
        WHERE u.user_id = $1
        
        `,[userId]);

        if (result.rows.length === 0) return null;

        const user = result.rows[0];

        // Datum formatieren
        const formatDate = (dateStr) => {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            return date.toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            });
        };

        return {
            ...user,
            created: formatDate(user.created),
            birthday: formatDate(user.birthday),
        };
    } catch (err) {
        console.error('Fehler beim Lesen des Profils:', err);
        throw err;
    }
}

//liest alle others die man selber bzw der User selbst geschrieben hat, um sie dann in /profile anzuzeigen
async function readPostForProfile(userId) {
    try {
        const client = await connectDatabase();
        const query = `
            SELECT * FROM others
            WHERE user_id = $1
            ORDER BY created DESC
        `;
        const result = await client.query(query, [userId]);

        return result.rows.map(row => {
            const date = new Date(row.created);
            const formattedDate = date.toLocaleDateString('de-DE', {
                day: '2-digit', month: 'short', year: 'numeric'
            });
            return {
                ...row,
                created: formattedDate
            };
        });
    } catch (err) {
        console.error('Fehler beim Lesen der Benutzer-Posts:', err);
        throw err;
    }
}

// others kombiniert mit users
async function readOthersWithUsers(isDashboard = false, userId) {
    console.log('userId:', userId);

    try {
        let query;
        let values =[];
        if(!isDashboard){  //wenn es nicht '/dashboard' ist, sondern nur '/', dann werden alle others angezeigt
         query = `
            SELECT 
                o.*,
                u.name as name,
                u.profile_pic
            
            FROM others o  
            JOIN users u ON o.user_id = u.user_id
            ORDER BY o.created DESC
        `;}
        else{      //ansonsten werden nur Others angezeigt von Usern denen der User folgt
        query = `
            SELECT
                o.*,
                u.name AS name,
                u.profile_pic
            FROM others o
                     JOIN users u ON o.user_id = u.user_id
            WHERE o.user_id IN (
                SELECT followee
                FROM follows
                WHERE follower = $1
            )
            OR o.user_id = $1       /* damit die eigenen others auch angezeigt werden*/
            ORDER BY o.created DESC
        `;
        values = [userId];
    }
        const result = await client.query(query, values);

        const formatted = result.rows.map(row => {
            const date = new Date(row.created);
            const formattedDate = date.toLocaleDateString('de-DE', {
                day: 'numeric', month: 'short', year: 'numeric'
            });
            return {
                ...row,
                created: formattedDate
            };
        });
        return formatted;

    } catch (err) {
        console.error('Fehler beim Lesen der Others mit Users:', err);
        throw err;
    }
}

async function checkLogin(name, password) {
    try {
        const query = 'SELECT * FROM users WHERE name = $1 AND password = $2';
        const result = await client.query(query, [name, password]);
        if (result.rows.length === 0) {
            return null;
        } else {
            return result.rows[0]; // gib den User zurück
        }


    } catch (err) {
        console.error('Fehler beim Login:', err);
        throw err;
    }
}

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/');
    }
    next();
}

async function updateProfilePic(userId, profilePic){
    try{
        const query = `UPDATE users SET profile_pic = $1 WHERE user_id = $2`;
        const values = [profilePic, userId];
        await client.query(query, values);
    }catch(err){
        console.error('Fehler beim Updaten des ProfilePics:', err);
    }
}

async function getHashtags(){

    const result = await client.query(`
    SELECT
        LOWER(tag) AS hashtag, /* wenn jemand #Test und wer anders #test schreibt, wird das als derselbe # gezählt*/
        COUNT(*) AS anzahl
    FROM (
             SELECT unnest(regexp_matches(text, '#[A-Za-z0-9_äöüÄÖÜ]+', 'g')) AS tag
             FROM others 
         ) AS alle
    GROUP BY hashtag
    ORDER BY anzahl DESC
    LIMIT 5;

    `);
    return result.rows;
}

function isValidBirthday(datumString) {
    const geburtsdatum = new Date(datumString);

    // Ungültiges Datum
    if (isNaN(geburtsdatum.getTime())) {
        return false;
    }

    const heute = new Date();
    if (geburtsdatum > heute) {
        return false; // Geburtstag darf nicht in der Zukunft liegen
    }

    const minDatum = new Date();
    minDatum.setFullYear(minDatum.getFullYear() - 120); // max 120 Jahre alt
    if(geburtsdatum < minDatum) {
        return false;
    }

    return true;
}

module.exports = {
    connectDatabase,
    readUsersFromDB,
    readOthersWithUsers,
    checkLogin,
    readUserProfile,
    isValidBirthday,
    readPostForProfile,
    requireLogin,
    updateProfilePic,
    getHashtags,
};