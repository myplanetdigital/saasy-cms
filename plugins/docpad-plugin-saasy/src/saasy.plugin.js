// JS version of CoffeeScript extends
var __hasProp = {}.hasOwnProperty,
  __extends = function(child, parent) {
    for (var key in parent) { 
            if (__hasProp.call(parent, key)) child[key] = parent[key];
        } 
        function ctor() { 
            this.constructor = child;
        }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
        child.__super__ = parent.prototype;
        return child;
  };

// Pure JS module for DOCPAD
module.exports = function(BasePlugin) {
  var Saasy,
      saasyInjection,
      collections = {},
      cheerio = require('cheerio'),
      gitpad = require('gitpad'),
      ncp = require('ncp'),
      fs = require('fs'),
      docpad,
      config;

  return Saasy = (function(_super) {

    __extends(Saasy, _super);

    function Saasy() {
      return Saasy.__super__.constructor.apply(this, arguments);
    }

    // Name our plugin
    Saasy.prototype.name = 'saasy';

    //remove spaces from filenames and give them a max length
    function fixFilePath(str) {
        return str.trim().split(' ').join('-').substring(0, 40).toLowerCase();
    }

    //determines if a given content type has a layout
    function hasLayout(type, parentKey) {
        var len = config.contentTypes.length;
        while(len--) {
            if(type === config.contentTypes[len].type) {
                if(parentKey && config.contentTypes[len][parentKey]) {
                    return config.contentTypes[len][parentKey].layout;
                } else {
                    return config.contentTypes[len].layout;
                }
            }
        }

        return false;
    }

    function getAdditionalLayouts(type, parentKey, dontTrimFirst) {
        var layouts = hasLayout(type, parentKey),
            layoutsCopy;
        
        if(Array.isArray(layouts) && layouts.length) {
            var layoutsCopy = layouts.concat([]);
            layoutsCopy.splice(0,1);
            return layoutsCopy;
        }

        return [];
    }

    function getLayouts(type, parentKey) {
        layouts = hasLayout(type, parentKey);
        if(!layouts) {
            return [];
        }
        if(!Array.isArray(layouts)) {
            layouts = [layouts];
        }
        return layouts;
    }    
    
    function getContentType(type) {
        var len = config.contentTypes.length;
        while(len--) {
            if(type === config.contentTypes[len].type) {
                return config.contentTypes[len]; 
            }
        }

        return null;
    }

    // Build the contents of a file to be saved as a string
   function fileBuilder(req, layout) {
    var key,
        loremIpsum = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque aliquam est convallis nibh vestibulum lacinia. Vestibulum dolor arcu, vulputate ut molestie sit amet, laoreet vitae mi. Suspendisse venenatis, quam at lacinia luctus, libero turpis molestie arcu, sed feugiat leo risus ac quam. Donec vel neque id tortor lacinia viverra. Pellentesque mollis justo purus. Cras quis tortor sed nibh fringilla gravida vitae eu diam. Ut erat elit, volutpat sed eleifend non, hendrerit vel tortor. Etiam facilisis sollicitudin venenatis. Morbi convallis tincidunt ligula, id tempor metus eleifend eu. Integer a risus ipsum, eu congue magna.'
        toReturn = '---\n';

        //maybe we shouldn't do this - title is not a saasy concept - but title is lowercase in the metadata
        //of all standard docpad modules/code
        if(req.body.Title && !req.body.title) {
            req.body.title = req.body.Title;
            delete req.body.Title;
        }
        if(layout) {
            req.body.layout = layout;
        }
        for (key in req.body) {
          if (req.body.hasOwnProperty(key) && key !== 'Content') {
            toReturn += key + ': "' + req.body[key] + '"\n';
          }
        }

        return toReturn += '---\n\n' + (req.body.Content ? req.body.Content.replace('__loremIpsum', loremIpsum) : '');
      }

    function getContentTypes(cb) {
        var configPath = config.rootPath + '/saasy.config.json.new';
        fs.readFile(configPath, function(err, data) {
          if (err) {
            console.log('Error reading your content types from ' + configPath);
            return cb({});
          }
          cb(JSON.parse(data));
        });
    }

    function initGitPad(cb) {
      //Initialize our Git Repo
      gitpad.init(config.rootPath + '/src/contents', cb);
    }

    //Bootstrap Saasy concepts when docpad is ready
    Saasy.prototype.docpadReady = function(opts) {
      docpad = opts.docpad;
      config = opts.docpad.config;
      
      /*
        Extend the template functions
      */
      
      // This function will find all documents in a given curated list and sort them
      // as specified by the curated list. We will also trim to a maxlength if specified
      config.templateData.getCuratedCollection = function(curatedList, maxLength) {
        var collection = this.getCollection('documents'),
            curation = collection.findOne({type: 'curation', name: curatedList});
        
        curation = curation ? curation.attributes.curation: [];
        
        /*
        //the comparator was not a good choice here as we're using the 
        //documents collection and it would cause the documents
        //collection to be reordered everytime a new document is added in the future
        
        collection.comparator = function(a) {
          return curation.indexOf(a.attributes.relativeBase);
        };
        */

        function sortAndTrim(collection) {
          maxLength = maxLength || collection.length;
          //sort our models based on the curated list and only return the maximum requested
          collection.models = collection.models.sort(function(a, b) {
            return curation.indexOf(a.attributes.relativeBase) - curation.indexOf(b.attributes.relativeBase);
          }).slice(0, maxLength);

          collection.length = maxLength;
          return collection;
        }

        return sortAndTrim(collection.findAll({type: {$ne: 'generated'}, relativeBase: {$in: curation}}));
      };

      // Escape HTML for use in JSON
      config.templateData.escapeForJSON = function (str) {
            return !str ? '' : 
                    str.replace(/[\\]/g, '\\\\')
                       .replace(/[\"]/g, '\\\"')
                       .replace(/[\/]/g, '\\/')
                       .replace(/[\b]/g, '\\b')
                       .replace(/[\f]/g, '\\f')
                       .replace(/[\n]/g, '\\n')
                       .replace(/[\r]/g, '\\r')
                       .replace(/[\t]/g, '\\t');
      };

      // Automatically wraps contents for inline editing
      config.templateData.editable = function (key) {
        return "<div style='inline-block' contenteditable='false'>"+ +"</div>"
      };

      //this creates a document via the file system, synchronously
      //used for generating documents during the docpadready event (which doesn't wait for a callback, so we gotta block)
      function createDocument(type, layouts, pageSize, category) {
        var filePath = config.documentsPaths + '/' + type + '/',
            fileName,
            layout,
            title,
            len = layouts.length;
        
        if(! fs.existsSync(filePath)) {
            fs.mkdir(filePath); 
        }
            
        while(len--) {
            layout = layouts[len];
            fileName = (category ? ('/category-' + category) : 'index') + (len ? ('-' + layouts[len]) : '') + '.html.md';
            if(! fs.existsSync(filePath + fileName)) {
                title = type + (category ? ' | ' + category : ''); 
                opts = { body: {  
                    pagedCollection: type,
                    isPaged: true,
                    pageSize: pageSize || 5, //todo read this from config
                    title: title,
                    Content: title
                }};
                if (category) {
                    opts.body.category = category;
                    opts.body.parentType = type;
                    opts.body.pagedCollection = type + ',' + category;
                }
               fs.writeFileSync(filePath + fileName, fileBuilder(opts, layout));
            }
        }
      }

      getContentTypes(function (result) {
        var key,
            len,
            len2,
            type,
            catCollection;

        //store all user defined content types 
        config.contentTypes = result.types;
        //special saasy global fields
        config.globalFields = {
            "Filename": "text",
            "Content": "textarea"
        };
        //add saasy global fields and user specified global fields to all content types
        for(key in result.globalFields) {
            if(result.globalFields.hasOwnProperty(key)) {
                config.globalFields[key] = result.globalFields[key];
            }    
        }

        //create a live collection for each content type for use in paginated lists
        len = result.types.length;
        while(len--) {
            type = result.types[len].type;
            docpad.setCollection(type, docpad.getCollection('documents').findAllLive({type:type}, {date:-1}));
            createDocument(type, getLayouts(type, "landing"), result.types[len].landing && result.types[len].landing.pageSize);
                
            //now create a collection and a landing page for each category
            len2 = result.types[len].categories && result.types[len].categories.names;
            if(len2) {
                catCollection = new docpad.Collection();
                result.types[len].categories.names.forEach(function(cat) {
                  catCollection.add({cat: cat});
                });
                docpad.setCollection(type + '-categories', catCollection); 
                
                len2 = len2.length;
                while(len2--) {
                    cat = result.types[len].categories.names[len2];
                    docpad.setCollection(type + ',' + cat, docpad.getCollection(type).findAllLive({category: {$in:[cat]}},{date:-1}));                     
                    createDocument(type, getLayouts(type, "categories"), result.types[len].categories.pageSize, cat);
                }
            }
        }
      });

      //setup our git repository
      initGitPad();
    };

    /* we may be able to use this to force docpad to generate everything */ 
    Saasy.prototype.generateBefore = function (opts) {
        //opts.reset = true;
        //console.log(arguments);
    };


    // Copy the script files over to the out directory
    Saasy.prototype.generateAfter = function(opts, next) {
      fs.exists(config.outPath + '/ckeditor', function(exists){
        if (!exists) {
          ncp(__dirname + '/ckeditor', config.outPath + '/ckeditor', function(err){
            if (err) {
              return console.log(err);
            }
        });
        }
      });

      ncp(__dirname + '/saasy.js', config.outPath + '/saasy.js', function(err){
        if (err) {
          return console.log(err);
        }
      });

      next();
    }

    Saasy.prototype.render = function(opts) {
      // console.log(opts.outExtension);
      // if (opts.inExtension.toLowerCase() === 'eco' && opts.file.get('url').split('.').pop().toLowerCase() === 'html') {
      //   opts.content = opts.content.replace(/<%[=|-]\s?(@content|@document\..+)\s?%>/g, '<div style="display: inline" contenteditable="false">$1</div>');
      // }
    }

    // Inject our CMS front end to the server 'out' files
    Saasy.prototype.renderDocument = function(opts, next) {
      var file = opts.file,
          injectionPoint = '<body>';

      // Enable inline editing for all appropriate elements
      // - For now do not allow inline editing for paginated views
      // if (file.type === 'document' && !file.get('isPaged')) {
      //   $ = cheerio.load(opts.content);
      //   $('section article').attr('contenteditable', 'false');
      //   $('section :header').attr('contenteditable', 'false');
      //   opts.content = $.html();
      // }


      function injectJs() {
        opts.content = opts.content.replace('<head>', '<head>\n\t<script src="/ckeditor/ckeditor.js"></script>\n\t<script src="/saasy.js"></script>');
        opts.content = opts.content.replace('<body>', '<body>' + saasyInjection);
        next();
      }
      
      // Only inject Saasy into Layouts with a opening body tag
      if (file.type === 'document' && file.attributes.isLayout && opts.content.indexOf(injectionPoint) > -1) {
        // If we've previously read our saasy cms files, then just inject the contents right away
        if (saasyInjection) {
          return injectJs();
        }

        // Read the contents of our Saasy JS/CSS/HTML
        return  fs.readFile(__dirname + '/saasy.css', function (err, cssData) {
          if (err) {
            next();
            return console.log(err);
          }
          fs.readFile(__dirname + '/saasy.html', function (err, markupData) {
            if (err) {
              next();
              return console.log(err);
            }
            // Build our file contents and inject them into the page markup
            saasyInjection = '<style data-owner="saasy" type="text/css">' + cssData + '</style>' + markupData + '<script data-owner="saasy">var $S = { contentTypes:' + JSON.stringify(config.contentTypes) + ', globalFields:' + JSON.stringify(config.globalFields) +'};\n' + '</script>';
            injectJs();
          });
        });
      }
      if (file.attributes.type === 'curation' || (file.attributes.type && !hasLayout(file.attributes.type) && ! file.get('isPaged'))) {
        file.attributes.write = false;
      }
      next();
    };


    // Add REST like calls for file CRUD operations on the express server
    Saasy.prototype.serverExtend = function(opts) {

      var server = opts.server,
          successStr = '{"success": true, "fileName": "[name]"}',
          fail =  '{"success": false}';

      function success(fileName) {
        return successStr.replace("[name]", fileName);
      }

      // Write the contents of a file to DOCPATH documents folder
      function fileWriter(str, req, cbSuccess, cbFail) {
        var fileName = fixFilePath(req.body.Filename)
            type = fixFilePath(req.body.type);

        function write () {
          var filePath = config.documentsPaths + '/' + type + '/' + fileName + '.' + (req.body.format || 'html') + '.md';  
          fs.writeFile(filePath, str, function (err) {
            if(err) {
              cbFail();
              return console.log('couldnt write file at ' + filePath); 
            }
            cbSuccess(filePath.replace(config.documentsPaths, '').replace('.md', ''));
          });
        }

        if (type && fileName) {
          var dirPath = config.documentsPaths + '/' + type;
          return fs.exists(dirPath, function (exists) {
            if (!exists) {
              return fs.mkdir(dirPath, function (err) {
                  if(err) {
                     cbFail();
                     return console.log('couldnt make directory at ' + dirPath); 
                  }
                  //docpad.action('generate', function(err,result){
                    //if (err) {
                      //console.log(err.stack);
                    //}
                    write();
                  //});
              });
            }
            write();
          }); 
        }
        cbFail();
      }

      // Deletes a document in the DOCPATH documents folder
      function fileDeleter(req, cbSuccess, cbFail) {
        var filePath = config.documentsPaths + '/' + fixFilePath(req.body.type) + '/' + req.body.url + '.html.md';
        if (req.body.type && req.body.url) {
          return fs.exists(filePath, function (exists) {
            if (!exists) {
              cbFail();
              return console.log('couldnt delete file at ' + filePath + ' as it does not exist'); 
            }
            fs.unlink(filePath, function (err) {
              if (err) {
                cbFail();
                return console.log(err);
              }
              console.log('File at ' + filePath + ' deleted');
              cbSuccess(filePath.replace(config.documentsPaths, '').replace('.md', ''));
            }); 
          });
        }
        cbFail();
      }

      // Renames an existing file in the DOCPATH documents folder
      function fileRenamer(req, cbSuccess, cbFail) {
        var oldPath = config.documentsPaths + '/' + fixFilePath(req.body.type) + '/' + req.body.url + '.html.md';
        if (req.body.type && req.body.url && req.body.urlNew) {
          return fs.exists(oldPath, function (exists) {
           if (!exists) {
             console.log('cannot rename ' + oldPath + ' as it does not exist');
             return cbFail();
           }
           
           var newPath = config.documentsPaths + '/' + fixFilePath(req.body.type) + '/' + req.body.urlNew + '.html.md';
           fs.rename(oldPath, newPath, function(err) {
             if (err) {
                console.log(err);
                return cbFail();
             }
             cbSuccess(newPath.replace(config.documentsPaths, '').replace('.md', ''));
           });
          });
        }
        cbFail();
      }

      // Express REST like CRUD operations
      function save(req, res) {
        fileWriter(fileBuilder(req), req, function(fileName) {
          gitpad.saveFile(config.documentsPaths + fileName + '.md', 'User initiated save of ' + fileName, 
            function(err) {
              console.log(err);
            });
          res.send(success(fileName));
        }, function () {
          res.send(fail);
        }); 
      }

      // Save a file
      server.post('/saasy', function (req, res) {
        save(req, res);
      });

      // Edit a file
      server.post('/saasy/edit', function (req, res) {
        save(req, res); 
      });
      
      // Delete a file
      server.delete('/saasy', function (req, res) {
        fileDeleter(req, function (fileName) {
          res.send(success(fileName));
        }, function () {
          res.send(fail);
        });
      });
    
      // Rename a file
      server.post('/saasy/rename', function (req, res) {
        fileRenamer(req, function (fileName) {
          res.send(success(fileName));
        }, function () {
          res.send(fail);
        });
      });
      
      // Get a Document 
      server.get('/saasy/document/:type?/:filename?', function(req, res) {

        // A helper function that takes a docpad file and output an object with desired fields from the file
        var fetchFields = function(file) {
          var data = { meta: file.meta, content: file.attributes.content };
          for (field in req.params.additionalFileds) {
            data[field] = file.attributes[field];
          }
          return data;
        }

        // If type and filename are both specified, send specific file
        if(req.params.type && req.params.filename) {
          var file = docpad.getFile({type: req.params.type, basename: req.params.filename});
          res.send(fetchFields(file));

        // If only type specified, send everthing in that type
        } else if (req.params.type) {
          var filter = {},
              sort = {};
          for(key in req.query) {
            if(req.query.hasOwnProperty(key)) {
              filter[key] = {$in:req.query[key].split(',')};
            }
          }

          sort[req.query.sort || 'date'] = req.query.sortOrder || -1;
          var collection = docpad.getCollection(req.params.type).findAll(filter, sort);
          var dataArray = [];
          for (var i=0; i<collection.models.length; i++) {
            dataArray.push(fetchFields(collection.at(i)));
          }

          res.send(dataArray);

        // If nothing specified, send all files (this includes the layout files!!)
        } else {
          var collection = docpad.getFiles({});
          var dataArray = [];
          var dataArray = [];
          for (var i=0; i<collection.models.length; i++) {
            dataArray.push(fetchFields(collection.at(i)));
          }

          res.send(dataArray);
        }
      });

    };
   
    /* Add Support for Multiple Layouts per Document */
    var toRender;
    Saasy.prototype.renderBefore = function(opts, next) {
        var count = 0,
            interval,
            document;

        toRender = [];
        
        function addDoc(model, additionalLayouts) {
          additionalLayouts.forEach(function(layout) {
            count++;
            document = docpad.createDocument(model.toJSON());
            document.normalize({}, function () {
                var name = document.get('basename') + '-' + layout;
                document.id = name;
                document.set('basename', name);
                document.set('layout', layout);
                document.setMeta('type', 'generated');
                document.contextualize({}, function () {
                    toRender.push(document);
                    if(!--count) {
                        next();
                    }
                });
            });
          });
        }

        opts.collection.forEach(function(model) {
            var meta = model.getMeta().attributes,
                key,
                contentType = getContentType(meta.type);
            if(contentType) {
                //"expand" all compound data types
                for(key in contentType.fields) {
                    if(contentType.fields.hasOwnProperty(key) && getContentType(contentType.fields[key]) && meta[key]) {
                        var obj = docpad.getCollection(contentType.fields[key]).findOne({ relativeBase:meta[key]});
                        model.set('$' + key, docpad.getCollection(contentType.fields[key]).findOne({ relativeBase:meta[key]}).attributes);
                    }
                }
            }

            var additionalLayouts = getAdditionalLayouts(model.attributes.type || model.attributes.pagedCollection);
            if(additionalLayouts.length) {
               if(model.get('isPaged')) {
                 //paged documents are handled by the paged plugin
                 return;
               }
               addDoc(model, additionalLayouts); 
            }

            if (model.get('type')) {
              model.set('title', '{editable}'+model.get('title')+'{/editable}');
              model.set('content', '{editable}'+model.get('content')+'{/editable}');
            }


        });

        if (!count) {
          next();
        }
    };

    /* This is also used for multiple layouts per document */ 
    Saasy.prototype.renderAfter = function(opts, next) {
        if(!toRender.length) {
            return next();
        }
        var count = 0,
            database = docpad.getDatabase('html');
        toRender.forEach(function(document) {
            count++;
            document.render({
                templateData: docpad.getTemplateData()
            }, function (err) {
                if(err) {
                  console.log("Error rending dynamic layout: " + err);
                } else {
                  database.add(document);
                }
                if(!--count) {
                  next();
                }
           });
        });
    };

    return Saasy;
  
  })(BasePlugin);
};
