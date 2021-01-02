const express = require('express')

const router = express.Router()

router.get('/', (req, res) => {
    console.log('reuest for index page')
    res.render('index', { index: null, error: null })
})

router.get('/astronomy', (req, res) => {
    console.log('reuest for astronomy page')
    res.render('astronomy', { astronomy: null, error: null })
})

router.get('/photo', (req, res) => {
    console.log('reuest for photo page')
    res.render('photo', { title: 'photo page' })
})

router.get('/weather', (req, res) => {
    console.log('reuest for weather page')
    res.render('weather', { weather: null, error: null })
})

router.get('/surf', (req, res) => {
    console.log('reuest for surf page')
    res.render('surf', { surf: null, error: null })
})

router.get('/calculator', (req, res) => {
    console.log('reuest for calculator page')
    res.render('calculator', { calculator: null, error: null })
})

module.exports = router;