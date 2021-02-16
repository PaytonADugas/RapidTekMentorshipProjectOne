'use strict';

//////////////////////////////////////////////////////////////////////////
//CONSTANTS
//////////////////////////////////////////////////////////////////////////

const PORT = 8080;
const HOST = '0.0.0.0';

const configDefaults = require('./config/defaults.json')
const express = require('express')
const expressLayouts = require('express-ejs-layouts')
const path = require('path')
const axios = require('axios')
const expressSession = require('express-session');
const methodOverride = require('method-override');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const bunyan = require('bunyan');
const morgan = require('morgan');
const config = require('./config');
const app = express()
const bodyParser = require('body-parser')
const MongoStore = require('connect-mongo')(expressSession);
const mongoose = require('mongoose');
const OIDCStrategy = require('passport-azure-ad').OIDCStrategy;
const sql = require('mssql');
const { kMaxLength } = require('buffer');

//////////////////////////////////////////////////////////////////////////
//APP SETTINGS
//////////////////////////////////////////////////////////////////////////

app.use(express.static(path.join(__dirname, '/public')));
app.use(expressLayouts)
app.use(morgan('dev'));
app.use(methodOverride());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }))
app.set('views', path.join(__dirname, 'views'))
app.set('layout', 'layout')
app.set('view engine', 'ejs')
app.engine('ejs', require('ejs').__express)

var log = bunyan.createLogger({
    name: 'Omnia Application Logs'
});

//////////////////////////////////////////////////////////////////////////
//AD AUTH
//////////////////////////////////////////////////////////////////////////

passport.serializeUser(function (user, done) {
    done(null, user.oid);
});

passport.deserializeUser(function (oid, done) {
    findByOid(oid, function (err, user) {
        done(err, user);
    });
});

var users = [];

var findByOid = function (oid, fn) {
    for (var i = 0, len = users.length; i < len; i++) {
        var user = users[i];
        log.info('we are using user: ', user);
        if (user.oid === oid) {
            return fn(null, user);
        }
    }
    return fn(null, null);
};

passport.use(new OIDCStrategy({
    identityMetadata: config.creds.identityMetadata,
    clientID: config.creds.clientID,
    responseType: config.creds.responseType,
    responseMode: config.creds.responseMode,
    redirectUrl: config.creds.redirectUrl,
    allowHttpForRedirectUrl: config.creds.allowHttpForRedirectUrl,
    clientSecret: config.creds.clientSecret,
    validateIssuer: config.creds.validateIssuer,
    isB2C: config.creds.isB2C,
    issuer: config.creds.issuer,
    passReqToCallback: config.creds.passReqToCallback,
    scope: config.creds.scope,
    loggingLevel: config.creds.loggingLevel,
    nonceLifetime: config.creds.nonceLifetime,
    nonceMaxAmount: config.creds.nonceMaxAmount,
    useCookieInsteadOfSession: config.creds.useCookieInsteadOfSession,
    cookieEncryptionKeys: config.creds.cookieEncryptionKeys,
    clockSkew: config.creds.clockSkew,
},
    function (iss, sub, profile, accessToken, refreshToken, done) {
        if (!profile.oid) {
            return done(new Error("No oid found"), null);
        }
        process.nextTick(function () {
            findByOid(profile.oid, function (err, user) {
                if (err) {
                    return done(err);
                }
                if (!user) {
                    users.push(profile);
                    return done(null, profile);
                }
                return done(null, user);
            });
        });
    }
));

if (config.useMongoDBSessionStore) {
    mongoose.connect(config.databaseUri);
    app.use(express.session({
        secret: 'secret',
        cookie: { maxAge: config.mongoDBSessionMaxAge * 1000 },
        store: new MongoStore({
            mongooseConnection: mongoose.connection,
            clear_interval: config.mongoDBSessionMaxAge
        })
    }));
} else {
    app.use(expressSession({ secret: 'keyboard cat', resave: true, saveUninitialized: false }));
}

app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());
app.use(passport.session());

function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) { return next(); }
    res.redirect('/login');
};

app.get('/login',
    function (req, res, next) {
        passport.authenticate('azuread-openidconnect',
            {
                response: res,                      // required
                resourceURL: config.resourceURL,    // optional. Provide a value if you want to specify the resource.
                customState: 'my_state',            // optional. Provide a value if you want to provide custom state value.
                failureRedirect: '/'
            }
        )(req, res, next);
    },
    function (req, res) {
        log.info('Login was called in the Sample');
        res.redirect('/');
    });

app.get('/auth/openid/return',
    function (req, res, next) {
        passport.authenticate('azuread-openidconnect',
            {
                response: res,    // required
                failureRedirect: '/'
            }
        )(req, res, next);
    },
    function (req, res) {
        log.info('We received a return from AzureAD.');
        res.redirect('/');
    });

app.post('/auth/openid/return',
    function (req, res, next) {
        passport.authenticate('azuread-openidconnect',
            {
                response: res,
                failureRedirect: '/'
            }
        )(req, res, next);
    },

    function (req, res) {
        log.info('We received a return from AzureAD.');
        res.redirect('/');

        app.get('/logout', function (req, res) {
            req.session.destroy(function (err) {
                req.logOut();
                res.redirect(config.destroySessionUrl);
            });
        });
    });


//////////////////////////////////////////////////////////////////////////
//ROUTES
//////////////////////////////////////////////////////////////////////////

app.get('/', function (req, res) {
    res.render('index', { user: req.user });
});

// notice how ensureAuthenticated is included, so as to keep the page exlusive to logged-in users

app.get('/account', ensureAuthenticated, async function (req, res) {
    res.render('account', { weatherMessage: await getWeather(), user: req.user });
});

app.get('/weather', ensureAuthenticated, async function (req, res) {
    res.render('weather', { weatherReport: await getWeather(), user: req.user });
});

app.get('/astronomy', ensureAuthenticated, async function (req, res) {
    res.render('astronomy', { astroReport: await getAstronomy(), user: req.user });
});

app.get('/surf', ensureAuthenticated, async function (req, res) {
    res.render('surf', { surfReport: await getSurf(), user: req.user });
});

//////////////////////////////////////////////////////////////////////////
//API QUERIES
//////////////////////////////////////////////////////////////////////////

// query weather website for weather report
let weatherResponse = async () => {
    let city = 'montgomery'
    let url = `${configDefaults.weatherSite}${city}&appid=${configDefaults.apiWeatherKey}&units=imperial`
    try {
        return await axios.get(url);
    } catch (error) {
        console.log(error);
    }
}

// return a string, given the response from the whether website
let getWeather = async () => {
    let weather = await weatherResponse();
    if (weather) {
        if (weather.status != 200) {
            return 'error'
        } else {
            weather = weather.data
            return `It's ${weather.main.temp} degrees Fahrenheit outside in ${weather.name} -
                The humidity is ${weather.main.humidity}% -
                The wind-speed is ${weather.wind.speed} m/s at ${weather.wind.deg} degrees.`
        }
    }
}

// query astronomy website for astronomy report
let astroResponse = async () => {
    let url = configDefaults.astroSite;
    try {
        return await axios.get(url);
    } catch (error) {
        console.log(error);
    }
}

// return a string, given the response from the astronomy website
let getAstronomy = async () => {
    let astro = await astroResponse();
    if (astro) {
        if (astro.status != 200) {
            return 'error'
        } else {
            let astronomy = astro.data
            if (astronomy.locations[0].values[1].moonphase) {
                let mp = astronomy.locations[0].values[1].moonphase
                if (mp == 0 || mp == 1) { return 'New Moon'; }
                if (mp < 0.25) { return 'Waxing Crescent'; }
                if (mp == 0.25) { return 'First Quarter'; }
                if (0.25 < mp < 0.5) { return 'Waxing Gibbous'; }
                if (mp == 0.5) { return 'Full Moon'; }
                if (mp < 0.75) { return 'Waning Gibbous'; }
                if (mp == 0.75) { return 'Last Quarter'; }
                if (mp < 1) { return 'Waning Crescent'; }
            }
        }
    }
}

// query surf website for surf report
let surfResponse = async () => {
    let surfID = 272
    // if (req.body.Rockies) {
    //     surfID = 658
    // }
    let url = `${configDefaults.surfSite}${configDefaults.apiSurfKey}/forecast/?spot_id=${surfID}`;
    try {
        return await axios.get(url);
    } catch (error) {
        console.log(error);
    }
}

// return a string, given the response from the surf website
let getSurf = async () => {
    let surf = await surfResponse();
    if (surf) {
        if (surf.status != 200) {
            return 'error'
        } else {
            surf = surf.data;
            let surfArray = [surf[surf.length - 32 - 4],
            surf[surf.length - 24 - 4],
            surf[surf.length - 16 - 4],
            surf[surf.length - 8 - 4],
            surf[surf.length - 0 - 4]]
            let message = ``
            for (let i = 0; i < surfArray.length; i++) {
                let t = surfArray[i].localTimestamp
                let time = new Date(0);
                time.setUTCSeconds(t);
                time = time.toUTCString();
                if (surfArray[i].swell != undefined) {
                    message += `<br>
                ${time.substring(0, 3).toUpperCase()}:<br>
                ${surfArray[i].swell.minBreakingHeight}-${surfArray[i].swell.maxBreakingHeight} FT ${surfArray[i].swell.components.combined.compassDirection} AT ${surfArray[i].swell.components.combined.period} SEC WITH ${surfArray[i].wind.speed} MPH ${surfArray[i].wind.compassDirection} WIND`
                }
            }
            return message;
        }
    }
}

//////////////////////////////////////////////////////////////////////////
//MISC FUNCTIONS
//////////////////////////////////////////////////////////////////////////

let add = function (num1, num2) {
    return num1 + num2;
}

let subtract = function (num1, num2) {
    return num1 - num2;
}

let multiply = function (num1, num2) {
    return num1 * num2;
}

let divide = function (num1, num2) {
    return num1 / num2;
}

//////////////////////////////////////////////////////////////////////////
//SQL LOGIN
//////////////////////////////////////////////////////////////////////////

const sqlconfig = {
    user: 'sqladmin',
    password: 'LoveYourNeighbor!',
    server: 'aggregatesqlserver.database.windows.net',
    database: 'AGGREGATEDEVDB',
    port: 1433
};

//////////////////////////////////////////////////////////////////////////
//API QUERIES
//////////////////////////////////////////////////////////////////////////

// sql.connect(sqlconfig, function (err) {

//     if (err) console.log(err);

//     let sqlrequest = new sql.Request();

//     let sqlQuery = `EXEC NumUsersWithPreference ${prefNum}`;

//     sqlrequest.query(sqlQuery, function (err, data) {
//         if (err) { throw 'Error! at sqlrequest' }
//         else {
//             res.render('getPreferenceSum', { preferenceSumMessage: `This many: ${Object.values(data.recordset[0])[0]} users are present with this type.`, user: req.user, error: null });
//         }
//     });
// });

//////////////////////////////////////////////////////////////////////////
//LISTEN
//////////////////////////////////////////////////////////////////////////

app.listen(PORT, function () {
    console.log(`Running on http://${HOST}:${PORT}`);
});