const fs = require('fs');

const theFile = __dirname + '/src/components/Layout/index.tsx';

if (!process.env.COMMIT_REF) return;

fs.readFile(theFile, 'utf8', function (err, data) {
  if (err) {
    return console.log(err);
  }

  const result = data.replace(/COMMIT_HASH/g, process.env.COMMIT_REF.substring(0, 7));

  fs.writeFile(theFile, result, 'utf8', function (err) {
    if (err) return console.log(err);
  });
});
