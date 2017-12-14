const compression = require('compression')
const express = require('express')
const wl = express()
const sassMiddleware = require('node-sass-middleware')
const fs = require('fs')
const async = require('async')
const path = require('path')
const Database = require('better-sqlite3')
const rss = require('rss')
const validator = require('validator')
const nconf = require('nconf')
const moment = require('moment')

nconf.argv()
     .env()


const env = ["prod", "dev"].includes(nconf.get('NODE_ENV')) ? nconf.get('NODE_ENV') : "dev"
nconf.file({ file: path.join(__dirname, "conf", env + ".conf.json") })

/**
 * Instantiate db file
 */
const dbFile = path.join(__dirname, nconf.get('dbPath'), nconf.get('dbFile')) || "wl.db"
const db = new Database(dbFile, { readonly: true });

function getSparsePost(row) {
  return {
    id: row.post_id || 0,
    title: row.title || '',
    subtitle: row.subtitle || '',
    type: row.type || 'essay',
    dateAdded: row.date_added || moment().format('YYYY-MM-DD HH:mm:ss'),
    dateUpdated: row.date_updated || moment().format('YYYY-MM-DD HH:mm:ss'),
    lat: row.lat || null,
    lng: row.lng || null,
    latlng: (row.lat && row.lng) ? row.lat + ', ' + row.lng : null,
    post: row.post || '',
    author: row.author || '',
    postlets: [],
    citations: []
  }
}

function buildPost(existingPost, row) {
  if(row.postlet_id) {
    existingPost.postlets.push({
      id: row.postlet_id,
      dateAdded: row.date_added || moment().format('YYYY-MM-DD HH:mm:ss'),
      lat: row.lat || null,
      lng: row.lng || null,
      post: row.post || ''
    })
  } 

  if(row.cite_id) {
    existingPost.citations.push({
      id: row.cite_id,
      citation: row.citation
    })
  }

  return existingPost
}

function getPosts(offset) {
  let posts = [],
      postsIndex = {};
  
  let query = 'SELECT * FROM (SELECT * FROM post ORDER BY post.date_added DESC LIMIT 2 OFFSET ' + offset + ') t' +
    ' LEFT JOIN postlet ON t.post_id = postlet.post_id' +
    ' LEFT JOIN citation ON t.post_id = citation.post_id' +
    ' ORDER BY t.date_added DESC, postlet.date_added DESC, citation.citation ASC'

  let rows = db.prepare(query).all()
  for(let i=0; i<rows.length; i++) {
    let row = rows[i]
    let postId = row.post_id
    if(!postsIndex.hasOwnProperty(postId)) {
      postKey = posts.length
      postsIndex[postId] = postKey
      posts.push(getSparsePost(row))
    } else {
      postKey = postsIndex[postId]
    }

    posts[postKey] = buildPost(posts[postKey], row)
  }
  return posts
}

function getPost(id) {
  let query = 'SELECT * FROM post' +
    ' LEFT JOIN postlet ON post.post_id = postlet.post_id' +
    ' LEFT JOIN citation ON post.post_id = citation.post_id' +
    ' WHERE post.post_id = ? postlet.date_added DESC, citation.citation ASC'

  let rows = db.prepare(query).all(id)
  let post = getSparsePost(row)
  for(let i=0; i<rows.length; i++) {
    row = rows[i]
    post = buildPost(post, row)
  }

  return post
}


/**
 * Build a post
 *
 * Callback should be a function that takes 2 arguments: the error condition
 * and undefined (for an error), or undefined and the post as an object
 *
 * @param int|object row The row ID or the row as object
 * @param function callback The callback function to call on error or success
 * @return true
 */
/*function buildPost(row, callback) {
  var post = {
    id: row.post_id || 0,
    title: row.title || '',
    subtitle: row.subtitle || '',
    type: row.type || 'essay',
    dateAdded: row.date_added || moment().format('YYYY-MM-DD HH:mm:ss'),
    dateUpdated: row.date_updated || moment().format('YYYY-MM-DD HH:mm:ss'),
    lat: row.lat || null,
    lng: row.lng || null,
    latlng: (row.lat && row.lng) ? row.lat + ', ' + row.lng : null,
    post: row.post || '',
    author: row.author || '',
    postlets: [],
    citations: []
  }

  
  var tasks = [];
  if(post.type === 'travel') {
    tasks.push(function(finishedPostlet) {
      db.each('SELECT * FROM postlet WHERE post_id = ? ORDER BY date_added DESC', [post.id], function(err, row) {
        post.postlets.push({
          id: row.postlet_id,
          dateAdded: row.date_added || moment().format('YYYY-MM-DD HH:mm:ss'),
          lat: row.lat || null,
          lng: row.lng || null,
          post: row.post || ''
        });
      },
      function(err, count) {
        finishedPostlet();
      });
    });
  } 

  tasks.push(function(finishedCitation) {
    db.each('SELECT * FROM citation WHERE post_id = ? ORDER BY citation ASC', [post.id], function(err, row) {
      post.citations.push({
        id: row.cite_id,
        citation: row.citation
      });
    },
    function(err, count) {
      finishedCitation();
    });
  });

  async.parallel(tasks, function() {
    // sort the postlets and the citations
    post.postlets.sort(function(a,b) {
      if(a.dateAdded == b.dateAdded) {
        return 0;
      }
      if(a.dateAdded < b.dateAdded) {
        return -1;
      }
      return 1;
    });

    post.citations.sort(function(a,b) {
      if(a.citation == b.citation) {
        return 0;
      }
      if(a.citation < b.citation) {
        return -1;
      }
      return 1;
    });
    callback(undefined, post);
  });

  return true
}*/


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
wl.use(compression())

wl.get('/', function(req, res) {
  res.render('index')
})

wl.listen(3000, function() {
  console.log('Listening')
  console.log(getPosts(1))
})