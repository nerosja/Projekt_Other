const express = require("express");
const dotenv = require("dotenv");
const path = require('path');
const {Client} = require("pg");
const session = require('express-session')
dotenv.config();
const PORT = process.env.PORT;
const multer = require("multer");
//alle Funktionen aus database.js
const {
    connectDatabase,
    readUsersFromDB,
    readOthersWithUsers,
    checkLogin,
    readUserProfile,
    readPostForProfile,
    requireLogin,
    isValidBirthday,
    updateProfilePic,
    getHashtags,
} = require("./util/database");
const res = require("express/lib/response");
app = express();

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
}))

app.use(express.static("public"));

app.set("views", "views");
app.set("view engine", "pug");


app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});
let dbClient;

async function initializeApp() {
    try {
        dbClient = await connectDatabase();
        console.log('Datenbank erfolgreich initialisiert');
    } catch (err) {
        console.error('Fehler bei der Datenbankinitialisierung:', err);
        process.exit(1);
    }
}


app.get('/dashboard', requireLogin , async (req, res) => {
    try {
        const currentUserId = req.session.user.id;
        const othersWithUsers = await readOthersWithUsers(true, currentUserId);
        const trends = await getHashtags();
        console.log(` ${othersWithUsers.length} Posts geladen`);
        res.render('dashboard', {
            title: 'Startseite',
            others: othersWithUsers,
            trends,
        });
    } catch (err) {
        console.error('Fehler beim Laden der Dashboard-Daten:', err);
        res.send('Fehler beim Laden der Daten');
    }
});

app.get('/login', async (req, res) => {
    try {
        res.render('login', { title: 'Login' });
    } catch (err) {
        console.error('Fehler beim Laden der Login-Page:', err);
        res.send('Fehler beim Laden der Login-Page');
    }
});

app.get('/', async (req, res) => {
    try{
        const landingPageDisplayingOthers = await readOthersWithUsers();

        console.log(` ${landingPageDisplayingOthers.length} Posts geladen`);
        res.render('landingpage',{
            others: landingPageDisplayingOthers,
        });
    }catch (err) {
        console.error('Fehler beim Laden der Landing-Page:', err);
        res.send('Fehler beim Laden der Landing-Page');
    }
})

app.post('/login', async (req, res) => {
    const { name, password } = req.body;

    try {
        const user = await checkLogin(name, password);

        if (user) {
            req.session.user = {
                id: user.user_id,
                name: user.name
            };
            res.redirect('/dashboard');
        } else {
            res.redirect('/login');
        }
    } catch (err) {
        console.error('Fehler beim Login:', err);
        res.send('Interner Serverfehler');
    }
});

app.post('/registrieren', async (req, res) => {
    const { name, password, geburtstag } = req.body;
    if (!isValidBirthday(geburtstag)) {
        return res.render('registrieren', {
            title: 'Registrieren',
            fehler: 'Bitte gib ein gültiges Geburtsdatum ein.'
        });
    }

    try{
        const created = new Date();
        const profile_pic = 'default';
        const bio_text ='';
        const query = `
        INSERT INTO users (name, password, birthday, created,bio_text, profile_pic)
        VALUES ($1, $2, $3, $4, $5, $6)
        
            `;

            await dbClient.query(query, [name, password, geburtstag, created, bio_text, profile_pic]);
            console.log('Erfolgreich registriert: ', name);
            res.redirect('/login');

    } catch (err){
        console.log('Fehler beim Registrieren:', err);
        res.send('Fehler beim Registrieren');
    }

})

app.get('/registrieren',async (req, res) => {
    res.render('registrieren', {title: 'Registrieren'});

})

app.get('/users',requireLogin, async (req, res) => {

    const currentUserId = req.session.user.id;
    const search = req.query.search || '';
    try {
        const users = await readUsersFromDB(currentUserId, search);
        console.log(`${users.length} Users geladen`);
        res.render('users', {
            title: 'Registrierte Nutzer',
            users,
            currentUserId,
            search
        });


    } catch (err) {
        console.error('Fehler beim Laden der User-Daten:', err);
        res.send('Fehler beim Laden der Benutzer');
    }
});

app.get('/profile/:id?',requireLogin, async (req, res) => {
    const userId = req.params.id || req.session.user.id;
    const currentUserId = req.session.user.id;
    try {
        const profile = await readUserProfile(userId);
        const userOthers = await readPostForProfile(userId);
        const uploadError = req.session.uploadError;
        delete req.session.uploadError;
        res.render('profile', {
            title: 'Nutzerprofil',
            profile,
            others: userOthers,
            uploadError,
            currentUserId,
        });
    } catch (err) {
        console.error('Fehler beim Laden des Profils:', err);
        res.send('Fehler beim Laden des Profils');
    }
});

app.get('/other', async (req, res) => {
    res.render('other', {title: 'Othern'});

})

app.post('/other-posten', requireLogin, async (req, res) => {
    const {other} = req.body;
    const user_id = req.session.user.id;

    try{
        const created = new Date();
        const query =  `
        INSERT INTO others (user_id, text, created)
        VALUES ($1, $2, $3)
        
        `;
        await dbClient.query(query, [user_id,other,created]);
        res.redirect('/dashboard');

    }catch(err){
        console.error('Fehler beim Schreiben des Others:', err);
        res.send('Fehler beim Schreiben des Others');
    }
})

app.post('/follow', requireLogin, async (req, res) => {
    const follower = req.session.user.id;
    const { followee, action } = req.body;


    try {
        if (action === 'follow') {
            if (follower !== followee) {
                await dbClient.query(`
                    INSERT INTO follows (follower, followee) 
                    VALUES ($1, $2)
                    ON CONFLICT DO NOTHING
                `, [follower, followee]);
            }
        } else if (action === 'unfollow') {
            await dbClient.query(`
                DELETE FROM follows 
                WHERE follower=$1 AND followee=$2
            `, [follower, followee]);
        }

        res.json({ success: true, newAction: action === "follow" ? "unfollow" : "follow" });
    } catch (err) {
        console.log('Fehler beim folgen/entfolgen', err);
        res.json({success : false});
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Fehler beim Logout:', err);
            return res.send('Fehler beim Logout');
        }
        res.redirect('/');
    });
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/img/users'));
    },
    filename: (req, file, cb) => {
        const userId = req.session.user.id;
        const filename = `${userId}Pic.png`;
        cb(null,filename);
    }
});

const upload = multer({storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Nur PNG-Dateien erlaubt'));
        }
    }
});

app.post('/upload', requireLogin,upload.single('avatar'), async (req, res) => {

    if(!req.session.user) return res.redirect('/login');
    const userId = req.session.user.id;
    try{
        res.redirect('/profile');
    }catch(err){
        console.error('Fehler beim Upload:', err);
        res.send('Fehler beim Upload');
    }
});

app.post('/upload-profile-pic', requireLogin, upload.single('avatar'), async (req, res) => {
        if (!req.file) {
            req.session.uploadError = 'Bitte eine PNG-Datei auswählen.';
            return res.redirect('/profile');
        }

        const filename = req.file.filename;
        const userId = req.session.user.id;
        const basenameWithoutPng = filename.replace('.png', '');

        try {
            await updateProfilePic(userId, basenameWithoutPng);
            res.redirect('/profile');
        } catch (err) {
            console.error('Fehler beim Upload:', err);
            res.send('Fehler beim Speichern des Bildes');
        }
    }
);

app.post('/delete-other', requireLogin, async (req, res) => {
    const userId = req.session.user.id;
    const { post_id } = req.body;

    try {
        await dbClient.query(`
            DELETE FROM others
            WHERE post_id = $1 AND user_id = $2
        `, [post_id, userId]);

        res.redirect('/profile');
    } catch (err) {
        console.error('Fehler beim Löschen:', err);
        res.send('Fehler beim Löschen des Others');
    }
});

app.use((err, req, res, next) => {
    console.error('Fehler:', err);
    if (err.message === 'Nur PNG-Dateien erlaubt') {
        req.session.uploadError = 'Nur PNG-Dateien erlaubt!';
        return res.redirect('/profile');
    }

});

async function startServer() {
    await initializeApp();

    app.listen(PORT, function() {
        console.log(`OTHer running and listening on port ${PORT}`);
    });
}

startServer().catch(err => {
    console.error('Fehler beim Starten des Servers:', err);
    process.exit(1);
});


