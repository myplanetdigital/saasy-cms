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
      saasyDependencies = '<script src="/ckeditor/ckeditor.js"></script><script src="/saasy.js"></script><script src="/angular.js"></script><script src="/admin.js"></script>',
      collections = {},
      gitpad = require('gitpad'),
      ncp = require('ncp'),
      crypto = require('crypto'),
      fs = require('fs'),
      cson = require('cson'),
      yaml = require('yamljs'),
      docpad,
      config;

  return Saasy = (function(_super) {

    __extends(Saasy, _super);

    function Saasy() {
      return Saasy.__super__.constructor.apply(this, arguments);
    }

    // Name our plugin
    Saasy.prototype.name = 'saasy';
    Saasy.prototype.priority = Number.MAX_VALUE;

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
        if(type === 'page') {
            return {};
        }
        var len = config.contentTypes.length;
        while(len--) {
            if(type === config.contentTypes[len].type) {
                return config.contentTypes[len]; 
            }
        }

        return null;
    }

    // Build the contents of a file to be saved as a string
   function fileBuilder(fileObject, layout, metaParser) {
      var key,
        loremIpsum = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque aliquam est convallis nibh vestibulum lacinia. Vestibulum dolor arcu, vulputate ut molestie sit amet, laoreet vitae mi. Suspendisse venenatis, quam at lacinia luctus, libero turpis molestie arcu, sed feugiat leo risus ac quam. Donec vel neque id tortor lacinia viverra. Pellentesque mollis justo purus. Cras quis tortor sed nibh fringilla gravida vitae eu diam. Ut erat elit, volutpat sed eleifend non, hendrerit vel tortor. Etiam facilisis sollicitudin venenatis. Morbi convallis tincidunt ligula, id tempor metus eleifend eu. Integer a risus ipsum, eu congue magna.'
        toReturn = '---\n';

      if(layout) {
        fileObject.layout = layout;
      }

      var content = fileObject.content;
      delete fileObject.content;

      if (metaParser) {
        switch (metaParser) {
          case 'cson':
            toReturn += cson.stringifySync(fileObject);
            break;

          case 'yaml':
            toReturn += yaml.stringify(fileObject);
            break;

          default:
            console.log("Unknown meta parser: " + metaParser + ". Using YAML as fallback.");
            toReturn += yaml.stringify(fileObject);
        }
      } else {
        toReturn += yaml.stringify(fileObject);
      }

      return toReturn += '---\n\n' + (content ? content.replace('__loremIpsum', loremIpsum) : '');
    }

    // Read the file and return an object containing meta and contents of the file
    function fileUpdater(req, cb) {
      var 
        filePath,
        model;

      var updateFile = function(filePath, model) {
        var fileObject = {};

        fs.readFile(filePath, function(err, data) {
          if (err) {
            console.log('Error reading file ' + filePath);
            return;
          }
          
          // Parse document and construct the object
          //  the following lines are grabbed and modified from docpad/out/lib/models/document.js line 95~133
          var regex = /^\s*(([^\s\d\w])\2{2,})(?:\x20*([a-z]+))?([\s\S]*?)\1/;
          var match = regex.exec(data);
          var metaData = {};
          data = "" + data; // Convert raw buffer into string

          if (match) {
            var seperator = match[1];
            var parser = match[3] || 'yaml';
            var header = match[4].trim();
            var body = data.substring(match[0].length).trim();

            switch (parser) {
              case 'cson':
              case 'coffee':
              case 'coffeescript':
              case 'coffee-script':
                metaData = cson.parseSync(header);
                fileObject = metaData;
                break;

              case 'yaml':
                metaData = yaml.parse(header);
                fileObject = metaData;
                break;

              default:
                console.log("Unknown meta parser: " + parser);
                return;
            }

          } else {
            body = data;
          }

          fileObject.content = body;

          // Replace whatever needed to be edited with new content
          for (key in model) {
            if (model.hasOwnProperty(key) && fileObject.hasOwnProperty(key)) {
              if (key != 'type') {
                fileObject[key] = model[key];
              }
            }
          }

          // console.log("\nFile model received:\n", model);
          // console.log("\nFile object constructed:\n", fileObject);
          var fileContent = fileBuilder(fileObject);
          // console.log("\nFile generated:\n", fileContent);
          fs.writeFileSync(filePath, fileContent);

        });
      }

      console.log(req.body);
      for (filePath in req.body) {
        model = req.body[filePath];

        // File is a partial
        switch (model.type) {
          case 'document':
            filePath = config.rootPath + '/src/contents/documents/' + filePath;
            break;

          case 'partial':
            filePath = config.rootPath + '/src/contents/partials/' + filePath;
            break;

          default:
            console.log('Unknown type: '+model.type);
            return;
        }

        updateFile(filePath, model);
      }
    }

    function getContentTypes(cb) {
        var configPath = config.rootPath + '/saasy.config.json';
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
                    str.toString()
                       .replace(/[\\]/g, '\\\\')
                       .replace(/[\"]/g, '\\\"')
                       .replace(/[\/]/g, '\\/')
                       .replace(/[\b]/g, '\\b')
                       .replace(/[\f]/g, '\\f')
                       .replace(/[\n]/g, '\\n')
                       .replace(/[\r]/g, '\\r')
                       .replace(/[\t]/g, '\\t');
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
                opts = { 
                    pagedCollection: type,
                    isPaged: true,
                    pageSize: pageSize || 5,
                    title: title/*,
                    content: title:*/  //Note: We used to also store the title in the "content", but the title should be on the title. Keep on eye that this doesn't cause regression
                };
                if (category) {
                    opts.category = category;
                    opts.parentType = type;
                    opts.pagedCollection = type + ',' + category;
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
            "content": "textarea"
        };
        config._globalFields = result.globalFields;
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
    /*Saasy.prototype.generateBefore = function (opts) {
        opts.reset = true;
        console.log(arguments);
    };*/


    // Copy the script files over to the out directory
    Saasy.prototype.generateAfter = function(opts, next) {
      ncp(__dirname + '/ckeditor', config.outPath + '/ckeditor', function(err){
        if (err) {
          return console.log(err);
        }
      });

      fs.exists(config.outPath + '/angular.js', function(exists){
        if (!exists) {
          ncp(__dirname + '/angular.js', config.outPath + '/angular.js', function(err){
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

      ncp(__dirname + '/admin.js', config.outPath + '/admin.js', function(err) {
        if (err) {
          return console.log(err);
        }
      });
      next();
    };

   //set up our editable content and wrap all partials with a div that contains their filename
   Saasy.prototype.render = function(opts) {
      if (opts.inExtension === 'eco') {
        opts.content = opts.content.replace(/<%[=|\-]\s*(@document[\.|\[](editable[\.|\[])?([a-zA-Z0-9_'"\s\]]+)?)\s*%>?/g, function(match, match2, isEditable, key) {
            var dataKey = key.replace(/'|"|]|/g,'').trim(),
                modelKey = 's.' + crypto.createHash('md5').update(opts.templateData.document.id + '.' + dataKey).digest("hex"),
                tagName = isEditable ? 'div' : 'i',
                htmlAttr = ' data-key="' + dataKey + '" ' +  (isEditable ? 'contenteditable="false"' : ''); 

              return '<' + tagName + htmlAttr + ' class="saasy-wrap" ng-model="' + modelKey + '" saasycontent>' + match.replace(/\.editable/, '') + '</' + tagName + '>';
        }).replace(/<%[-|=]\s*@partial\(\s*['|"](.*?)['|"]\s*\)\s*%>/g, function(match, filepath) { 
          return '<div class="saasy-partial" data-filepath="' + filepath + '">' + match + '</div>'
        });
      }
    };

    // Inject our CMS front end to the server 'out' files
    Saasy.prototype.renderDocument = function(opts, next) {
      var file = opts.file;

      function injectSaasy() {
        opts.content = opts.content.replace(/<body((.*?)(class=['|"](.*?)['|"](.*?))?)>/i, 
                '<body class="saasy-document $4" $2 $5 data-filepath="' + opts.templateData.document.id + '">' + saasyInjection + saasyDependencies);
        next();
      }
      
      // Only inject Saasy into Layouts with a opening body tag
      if (file.type === 'document' && file.attributes.isLayout && opts.content.match(/<body/)) {
        // If we've previously read our saasy cms files, then just inject the contents right away
        if (saasyInjection) {
          return injectSaasy();
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
            injectSaasy();
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
        var fileName,
            type = fixFilePath(req.body.type);

        if (!req.body.filename) {
          fileName = fixFilePath(req.body[req.body.primaryid]);
        } else {
          fileName = fixFilePath(req.body.filename)
        }

        console.log(fileName);

        function write () {
          var filePathNoExt = config.documentsPaths + '/' + type + '/' + fileName;
          var fileExt = (req.body.format || 'html') + '.md';
          var filePath = filePathNoExt + '.' + fileExt;
          counter = 0;
          while (fs.existsSync(filePath)) {
            counter++;
            filePath = filePathNoExt + '-' + counter + '.' + fileExt;
          }
          console.log(filePath);

          fs.writeFile(filePath, str, function (err) {
            if(err) {
              cbFail();
              return console.log('couldn\'t write file at ' + filePath); 
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
      };

      // Deletes a document in the DOCPATH documents folder
      function fileDeleter(req, cbSuccess, cbFail) {
        var filePath = config.documentsPaths + '/' + fixFilePath(req.body.type) + '/' + req.body.filename + '.html.md';
        if (req.body.type && req.body.filename) {
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
        fileWriter(fileBuilder(req.body), req, function(fileName) {
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

      server.post('/saasy/file', function(req, res) {
        var key,
            successful = [],
            failed = [],
            count = 0;

        for (key in req.files) {
          if (req.files.hasOwnProperty(key) && req.files[key].name) {
             (function (file) {
                var path = file.path,
                    renameCounter = 0,
                    name = config.filesPaths[0] + '/' + file.name,
                    origName = name,
                    result = {};
                count++;
                while (fs.existsSync(name)) {
                    name = origName.replace(/(.*?)(\..*)/, '$1-' + (++renameCounter) + '$2')
                }
                fs.rename(path, name, function (err) {
                    if(!err) {
                        if(renameCounter) {
                            successful.push({origName:file.name, newName:name.replace(config.filesPaths[0] + '/', '')});
                         } else {
                            successful.push({name:file.name});
                         }
                    } else {
                        console.log(err);
                        failed.push({file:file.name, err:err});
                    }
                    if (!--count) {
                        if (successful.length + failed.length === 1) {
                            return res.send(successful.length ? {success: successful} : {failure: err});
                        }
                        res.send({success: successful, error: failed}); 
                    }
                });
             }(req.files[key]));
          }
        }
        if (!count) {
            res.send('No Files specified');
        } 
      });

      // Edit a file
      server.post('/saasy/edit', function (req, res) {
        fileUpdater(req);
        res.send('success');
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
      
      /*
        Get a Document 
        Permitted get arguments:
        - af: an array of additional fields to fetch for each docpad file. If not specified will only return meta, content, create and modified time.
        - filter: a json object used as filter, can contain string or arrays. If not specified will return everything.
        - sort: a field used to sort the list of result. If not specified will sort by date decrementally.
        - sortOrder: an order used to sort, default -1.
      */
      var done = false;
      server.get('/saasy/document/:type?/*', function(req, res) {
        var data = [],
            collection,
            filter,
            file,
            counter,
            i;

        // A helper function that takes a docpad file and output an object with desired fields from the file
        function fetchFields(file) {
          var meta = file.meta,
              data;
          meta.content = file.attributes.content || meta.content;
          data = { filename: file.attributes.id, 
                   url: file.attributes.url, 
                   meta: file.meta, 
                   contentType: file.attributes.outContentType,
                   encoding: file.attributes.encoding,
                   renderedContent: file.attributes.contentRendered 
          };
          for (var i = 0; req.query.af && i<req.query.af.length; i++) {
            var field = req.query.af[i];
            data[field] = file.attributes[field];
          }
          return data;
        }

        function getFilteredCollection(type) {
          var filter = {},
              sort = {},
              filename,
              filterObject = req.query.filter ? JSON.parse(req.query.filter) : {},
              collection;

          // Be ware: the filter is applied on the attributes of the file, not the META which is what the user is getting!
          for(key in filterObject) {
            if(filterObject.hasOwnProperty(key)) {
              if (Object.prototype.toString.call(filterObject[key]) === '[object Array]') {
                filter[key] = {$in:filterObject[key]};
              } else if (typeof filterObject[key] === 'string') {
                filter[key] = filterObject[key];
              }
            }
          }
          for(key in req.query._filter) {
            if(req.query._filter.hasOwnProperty(key)) {
              filter[key] = req.query._filter[key];
            }
          }
          sort[req.query.sort || 'date'] = req.query.sortOrder || -1;

          if (type) {
            collection = docpad.getCollection(type).findAll(filter, sort);
          } else {
            filter.type = {$ne: 'generated'};
            collection = docpad.getCollection('documents').findAll(filter, sort);
          }
          return collection;
        }


        if(req.params.type === 'file' || req.params[0] === 'file') {
            req.params.type = 'files';
        }
        req.params.filename = req.params[0];
        if(req.params.type && req.params.filename) {
            filter = { type: req.params.type, basename: req.params.filename.replace(/\s/g, '-')};
            counter = 1;
          if(req.params.type.toLowerCase().trim() === 'files') {
            while(req.params[counter]) {
                req.params.filename += (!counter ? '/' : '') + req.params[counter++];
            }
            filename = req.params.filename.toLowerCase().replace(/\/|\s/g, '');
            if(filename === 'images' || filename === 'image') {
                req.query._filter = { outContentType: {$in: [ "image/png", "image/pjpeg", "image/jpeg", "image/gif", "image/tiff", "image/svg+xml" ]}};
            } else if(filename === 'videos' || filename === 'video') {
                req.query._filter = { outContentType: {$in: [ "video/mpeg", "video/mp4", "video/ogg", "video/quicktime", "video/x-flv" ]}};
            } else {
                filter = { relativePath: req.params.filename };
            }
          }

          if(! req.query._filter) {
            file = docpad.getFile(filter);
            data = file ? fetchFields(file) : [];
            return res.send(data);
          }
        }
        collection = getFilteredCollection(req.params.type || req.params[0]);
        if(req.query.pageSize && req.query.page) {
          collection.models = collection.models.slice(req.query.pageSize * (req.query.page - 1), req.query.pageSize * req.query.page);
        }
        for (i = 0; i<collection.models.length; i++) {
          data.push(fetchFields(collection.at(i)));
        }
        
        res.send(data);
      });

    }; 
   
    /* Add Support for Multiple Layouts per Document */
    var toRender,
        crypto = require('crypto');
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
                document.set('type', 'generated');
                document.setMeta('layout' + (count + 1), 'true');
                document.setMeta('generatedDoc', 1);
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
              for(key in contentType.fields) {
                if(contentType.fields.hasOwnProperty(key) && meta[key]) {
                  //"expand" all compound data types
                  if(getContentType(contentType.fields[key])) {
                    var obj = docpad.getCollection(contentType.fields[key]).findOne({ relativeBase:meta[key]});
                    model.set('$' + key, docpad.getCollection(contentType.fields[key]).findOne({ relativeBase:meta[key]}).attributes);
                  }
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
