'use strict';

const PORT = 8080;
const HOST = '0.0.0.0';

const config = require('./config/defaults.json')
const express = require('express')
const path = require('path')
const request = require('request')
const routes = require('./routes')

const app = express()
app.use(express.static(__dirname + '/public'));
const bodyParser = require('body-parser')

const slackService = require('./slack.js');

app.use(bodyParser.urlencoded({ extended: true }))
app.use('/', routes)

app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.engine('ejs', require('ejs').__express)

app.post('/astronomy', function (req, res) {
    let url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/weatherdata/forecast?aggregateHours=24&combinationMethod=aggregate&includeAstronomy=true&contentType=json&unitGroup=us&locationMode=array&key=Y0K754RVDRSAN3WIHC30UY2ZW&dataElements=default&locations=955%20La%20Paz%20Road%20Santa%20Barbara`
    request(url, function (err, response, body) {
        if (err) {
            res.render('astronomy', { astronomy: null, error: 'Error, please try again' })
        } else {
            let astronomy = JSON.parse(body)
            console.log(astronomy)
            if (astronomy.locations == undefined) {
                res.render('astronomy', { astronomy: null, error: 'Error, please try again' })
            } else {
                if (astronomy.locations[0].values[1].moonphase) {
                    let mp = astronomy.locations[0].values[1].moonphase
                    if (mp == 0) { res.render('astronomy', { astronomy: 'New Moon', error: null }) }
                    if (mp < 0.25) { res.render('astronomy', { astronomy: 'Waxing Crescent', error: null }) }
                    if (mp == 0.25) { res.render('astronomy', { astronomy: 'First Quarter', error: null }) }
                    if (0.25 < mp < 0.5) { res.render('astronomy', { astronomy: 'Waxing Gibbous', error: null }) }
                    if (mp == 0.5) { res.render('astronomy', { astronomy: 'Full Moon', error: null }) }
                    if (mp < 0.75) { res.render('astronomy', { astronomy: 'Waning Gibbous', error: null }) }
                    if (mp == 0.75) { res.render('astronomy', { astronomy: 'Last Quarter', error: null }) }
                    if (mp < 1) { res.render('astronomy', { astronomy: 'Waning Crescent', error: null }) }
                }
            }
        }
    })
})

app.post('/weather', function (req, res) {
    let city = req.body.city || 'haleiwa'
    let url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${config.apiWeatherKey}&units=imperial`
    request(url, function (err, response, body) {
        if (err) {
            res.render('weather', { weather: null, error: 'Error, please try again' })
        } else {
            let weather = JSON.parse(body)
            console.log(weather)
            if (weather.main == undefined) {
                res.render('weather', { weather: null, error: 'Error, please try again' })
            } else {
                let message = `
                It's ${weather.main.temp} degrees Fahrenheit outside in ${weather.name} -
                The humidity is ${weather.main.humidity}% -
                The wind-speed is ${weather.wind.speed} m/s at ${weather.wind.deg} degrees.`
                res.render('weather', { weather: message, error: null })
            }
        }
    })
})
app.post('/surf', function (req, res) {
    let surfID = 272
    if (req.body.Rockies) {
        surfID = 658
    }
    let url = `http://magicseaweed.com/api/${config.apiSurfKey}/forecast/?spot_id=${surfID}`
    request(url, function (err, response, body) {
        if (err) {
            res.render('surf', { surf: null, error: 'Error, please try again' })
        } else {
            let surf = JSON.parse(body)
            let surfArray = [surf[surf.length - 32 - 4],
            surf[surf.length - 24 - 4],
            surf[surf.length - 16 - 4],
            surf[surf.length - 8 - 4],
            surf[surf.length - 0 - 4]]
            let message = ``
            for (let i = 0; i < surfArray.length; i++) {
                let t = surfArray[i].localTimestamp
                let time = new Date(0)
                time.setUTCSeconds(t)
                time = time.toUTCString()
                console.log(surfArray[i].swell.maxBreakingHeight)
                if (surfArray[i].swell != undefined) {
                    message += `<br>
                    ${time.substring(0, 3).toUpperCase()}:<br>
                    ${surfArray[i].swell.minBreakingHeight}-${surfArray[i].swell.maxBreakingHeight} FT ${surfArray[i].swell.components.combined.compassDirection} AT ${surfArray[i].swell.components.combined.period} SEC WITH ${surfArray[i].wind.speed} MPH ${surfArray[i].wind.compassDirection} WIND`
                }
            }
            res.render('surf', { surf: message, error: null })
        }
    })
})

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

app.post('/calculator', function (req, res) {
    let message = ``
    let num1 = parseFloat(req.body.numberone)
    let num2 = parseFloat(req.body.numbertwo)
    let func = req.body.functionality.toUpperCase()
    console.log(func)
    if (func == 'ADD' || func == '+') {
        message += `${num1} + ${num2} = ${add(num1, num2)}`
    } else if (func == 'SUBTRACT' || func == '-') {
        message += `${num1} - ${num2} = ${subtract(num1, num2)}`
    } else if (func == 'MULTIPLY' || func == '*' || func == 'X') {
        message += `${num1} x ${num2} = ${multiply(num1, num2)}`
    } else if (func == 'DIVIDE' || func == '/') {
        message += `${num1} / ${num2} = ${divide(num1, num2)}`
    } else message += 'Please Try Again'
    res.render('calculator', { calculator: message, error: null })
})

app.listen(PORT, function () {
    console.log(`Running on http://${HOST}:${PORT}`)
})