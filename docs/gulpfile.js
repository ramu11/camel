/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const { dest, series, parallel, src, symlink } = require('gulp');
const del = require('del');
const inject = require('gulp-inject');
const map = require('map-stream')
const path = require('path');
const rename = require('gulp-rename');
const sort = require('gulp-sort');
const through2 = require('through2');
const File = require('vinyl')
const fs = require('fs');

function deleteComponentSymlinks() {
    return del(['components/modules/ROOT/pages/*', '!components/modules/ROOT/pages/index.adoc']);
}

function deleteComponentImageSymlinks() {
    return del(['components/modules/ROOT/assets/images/*']);
}

function createComponentSymlinks() {
    return src('../components/{*,*/*}/src/main/docs/*.adoc')
        .pipe(map((file, done) => {
            // this flattens the output to just .../pages/....adoc
            // instead of .../pages/camel-.../src/main/docs/....adoc
            file.base = path.dirname(file.path);
            done(null, file);
        }))
        // Antora disabled symlinks, there is an issue open
        // https://gitlab.com/antora/antora/issues/188
        // to reinstate symlink support, until that's resolved
        // we'll simply copy over instead of creating symlinks
        // .pipe(symlink('components/modules/ROOT/pages/', {
        //     relativeSymlinks: true
        // }));
        // uncomment above .pipe() and remove the .pipe() below
        // when antora#188 is resolved
        .pipe(dest('components/modules/ROOT/pages/'));
}

function createComponentImageSymlinks() {
    return src('../components/{*,*/*}/src/main/docs/*.png')
        .pipe(map((file, done) => {
            // this flattens the output to just .../pages/....adoc
            // instead of .../pages/camel-.../src/main/docs/....adoc
            file.base = path.dirname(file.path);
            done(null, file);
        }))
        // Antora disabled symlinks, there is an issue open
        // https://gitlab.com/antora/antora/issues/188
        // to reinstate symlink support, until that's resolved
        // we'll simply copy over instead of creating symlinks
        // .pipe(symlink('components/modules/ROOT/pages/', {
        //     relativeSymlinks: true
        // }));
        // uncomment above .pipe() and remove the .pipe() below
        // when antora#188 is resolved
        .pipe(dest('components/modules/ROOT/assets/images/'));
}

function titleFrom(file) {
    const maybeName = /(?:=|#) (.*)/.exec(file.contents.toString())
    if (maybeName == null) {
        throw new Error(`${file.path} doesn't contain Asciidoc heading ('= <Title>') or ('# <Title')`);
    }

    return maybeName[1];
}

function insertGeneratedNotice() {
    return inject(src('./generated.txt'), {
               name: 'generated',
               removeTags: true,
               transform: (filename, file) => {
                   return file.contents.toString('utf8');
               }
           });
}

function createComponentNav() {
    return src('component-nav.adoc.template')
        .pipe(insertGeneratedNotice())
        .pipe(inject(src('../components/{*,*/*}/src/main/docs/*.adoc').pipe(sort()), {
            removeTags: true,
            transform: (filename, file) => {
                const filepath = path.basename(filename);
                const title = titleFrom(file);
                return `* xref:${filepath}[${title}]`;
            }
        }))
        .pipe(rename('nav.adoc'))
        .pipe(dest('components/modules/ROOT/'))
}

const extractExamples = function(file, enc, next) {
    const asciidoc = file.contents.toString();
    const includes = /(?:include::\{examplesdir\}\/)([^[]+)/g;
    let example;
    let exampleFiles = new Set()
    while (example = includes.exec(asciidoc)) {
        let examplePath = path.resolve(path.join('..', example[1]));
        exampleFiles.add(examplePath);
    }

    exampleFiles.forEach(examplePath => this.push(new File({
        base: path.resolve('..'),
        path: examplePath,
        contents: fs.createReadStream(examplePath)
    })));

    return next();
}

function deleteExamples(){
    return del('components/modules/ROOT/examples/');
}

function createComponentExamples() {
    return src('../components/{*,*/*}/src/main/docs/*.adoc')
        .pipe(through2.obj(extractExamples))
        .pipe(dest('components/modules/ROOT/examples/'));
}

const symlinks = parallel(
  series(deleteComponentSymlinks, createComponentSymlinks),
  series(deleteComponentImageSymlinks, createComponentImageSymlinks)
);
const nav = createComponentNav;
const examples = series(deleteExamples, createComponentExamples);

exports.symlinks = symlinks;
exports.nav = nav;
exports.examples = examples;
exports.default = series(symlinks, nav, examples);

