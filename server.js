const express = require('express')
const wl = express()
var sassMiddleware = require('node-sass-middleware')
var path = require('path')

wl.set('view engine', 'ejs')

wl.use(
  sassMiddleware({
    src: __dirname + '/sass',
    dest: __dirname + '/public/style',
    debug: true,
    outputStyle: 'compressed',
    prefix: '/style'
  })
)
wl.use(express.static(path.join( __dirname, 'public' )))

wl.get('/', function(req, res) {
  res.render('index')
})

wl.listen(3000, function() {
  console.log('Listening')
  console.log(__dirname + '/sass')
})