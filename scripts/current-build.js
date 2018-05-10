let fs = require("fs")

// Description:
//   Returns the current deployed build.
//
// Dependencies:
//   None
//
// Commands:
//   hubot current build
//
// Author:
//   shadowfiend

let buildNumberBuffer = ""
try {
    buildNumberBuffer = fs.readFileSync(`${__dirname}/../BUILD`)
} catch (e) {
    console.error("Error reading buildNumber file: " + e)
}
let buildNumber = buildNumberBuffer.toString()

// TODO Announce new build to Bifrost flow, configured.

module.exports = function (robot) {
    robot.respond(/current build/, (response) =>
        response.send(`I'm on build [${buildNumber}](https://circle-ci.com/gh/cardforcoin/heimdall/${buildNumber})!`))
}