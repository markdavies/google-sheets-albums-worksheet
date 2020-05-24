var inputInterval;
var averageColumnTitle = 'Av. Album Score';
var maxResults = 20;

function onOpen() {

    var ui = SpreadsheetApp.getUi();

    ui.createMenu('Albums')
        .addItem('Add Album', 'addAlbum')
        .addItem('Generate Results', 'generateResults')
        .addToUi();
  
}

function addAlbum(){
  
  var accessToken = PropertiesService.getScriptProperties().getProperty('accessToken');
  var accessExpires = PropertiesService.getScriptProperties().getProperty('accessExpires');
  
  var expires = parseInt(accessExpires)
  var now = new Date();
  
  if(accessToken == null || expires < now.getTime()){
    authorise();
    
  }else{
  
    var ui = SpreadsheetApp.getUi();
    var htmlOutput = HtmlService.createHtmlOutputFromFile('search').setWidth(750).setHeight(500);
    
    ui.showModalDialog(htmlOutput, 'Add album');
    
  }
  
}

function authorise(){
  
  var clientId = PropertiesService.getScriptProperties().getProperty('clientId');
  var clientSecret = PropertiesService.getScriptProperties().getProperty('clientSecret');
  
  var url = "https://accounts.spotify.com/api/token";
  var params = {
      method: "post",
      headers: {"Authorization" : "Basic " + Utilities.base64Encode(clientId + ":" + clientSecret)},
      payload: {grant_type: "client_credentials"},
  };
  
  var res = UrlFetchApp.fetch(url, params);
  var obj = JSON.parse(res.getContentText());
  var expires = new Date();
  
  accessToken = obj.access_token;
  
  PropertiesService.getScriptProperties().setProperty('accessToken', obj.access_token);
  PropertiesService.getScriptProperties().setProperty('accessExpires', (expires.getTime() + (obj.expires_in * 1000)).toString());
  
  addAlbum();
  
}

function doSearch(input){
  
  var accessToken = PropertiesService.getScriptProperties().getProperty('accessToken');
  
  var options = {
    headers: { 
      'Authorization': 'Bearer ' + accessToken,
      'Cache-Control' : 'max-age=0'
    }
  };
  
  var url = 'https://api.spotify.com/v1/search';
  var parts = []; 
  parts.push('q=' + encodeURIComponent(input));
  parts.push('type=album');
  
  var response = UrlFetchApp.fetch(url + '?' + parts.join('&'), options);
  response = JSON.parse(response);
  options = [];
  
  for(var i in response.albums.items){
    
    var album = response.albums.items[i];
    var artists = album.artists.map(function(artist){
      return artist.name;
    });
    var image = album.images.length > 0 ? album.images[0].url : null;
    var releaseYear = album.release_date.split('-')[0];
    var href = album.external_urls && album.external_urls.spotify ? album.external_urls.spotify : '';
    
    if(releaseYear < parseInt(PropertiesService.getScriptProperties().getProperty('minAlbumYear'))) continue;
    if(releaseYear > parseInt(PropertiesService.getScriptProperties().getProperty('maxAlbumYear'))) continue;
    
    var option = {
      id: album.id,
      albumName: album.name,
      releaseYear: releaseYear,
      artists: artists.join(', '),
      href: href,
      uri: album.uri,
      image: image
    };
    options.push(option);
    
    if(i >= 6) break;
    
  }
  
  return options;
    
}

function doAlbumAdd(option){
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Albums');
  var rangeData = sheet.getDataRange();
  var rowStart = 2;
  var lastRow = rangeData.getLastRow();
  var lastColumn = rangeData.getLastColumn();  
  var searchRange = sheet.getRange(rowStart, 1, lastRow-1, 1);
  var searchRangeValues = searchRange.getValues();
  var found = false;
  var addAtRow = -1;
  var exists = false;
  var nextYear = (parseInt(option.releaseYear) + 1).toString();
  var scoreColumnInfo = getScoreColumnInfo();
  
  for (var i = 0; i < lastRow - 1; i++){
    
    if(found == false && searchRangeValues[i][0] == option.releaseYear){
      found = true;
    }else if(found && (searchRangeValues[i][0] == nextYear) || i ==  lastRow - 1){
      addAtRow = i;
    }
    
    var forumula = rangeData.getCell(i+1, 3).getFormula();
    if(forumula != '' && option.href != '' && forumula.indexOf(option.href) != -1){
      exists = true;
    }
    
  }
  
  if(addAtRow == -1){
    addAtRow = lastRow;
  }else{
    addAtRow += rowStart;
  }
  
  if(!exists){
    
    sheet.insertRows(addAtRow, 1);
    
    sheet.getRange(addAtRow, 1, 1, 2).setValues([[
      option.artists,
      option.albumName
    ]]);
    
    rangeData.getCell(addAtRow, 3).setFormula('=HYPERLINK("'+option.href+'","View")');
    
    // set style for everything up to scores columns
    var styleRange = sheet.getRange(addAtRow, 1, 1, lastColumn);
    styleRange.setBackground('white');
    styleRange.setFontSize(10);
    styleRange.setFontWeight('normal');
    
    // set question marks and styles in score columns
    var scoreRange = sheet.getRange(addAtRow, 5, 1, scoreColumnInfo['average'] - 6);
    scoreRange.setValue('?');
    
    var allScoresRange = sheet.getRange(2, 5, lastRow, scoreColumnInfo['average'] - 6);
    
    var rule1 = SpreadsheetApp.newConditionalFormatRule()
                .whenTextEqualTo('?')
                .setBackground("#f3f3f3")
                .setRanges([allScoresRange])
                .build();
    
    var rule2 = SpreadsheetApp.newConditionalFormatRule()
                .whenNumberGreaterThan(-0.1)
                .setBackground("#b6d7a8")
                .setRanges([allScoresRange])
                .build();
    
    sheet.setConditionalFormatRules([rule1, rule2]);
    
    // set formula for average score
    var averageRange = sheet.getRange(addAtRow, scoreColumnInfo['average'], 1, 1);
    var scoreRange = 'E'+addAtRow+':I'+addAtRow;
    var formula = '=IF(COUNTIF('+scoreRange+',"<>?") > 1, ROUND(DIVIDE(SUMIF('+scoreRange+', "<>?"), COUNTIF('+scoreRange+',"<>?")),2), "")';
    
    averageRange.setFormula(formula);
    
  }
  
}

function getScoreColumnInfo(){
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Albums');
  var rangeData = sheet.getDataRange();
  var lastColumn = rangeData.getLastColumn();
  var titleRange = sheet.getRange(1, 1, 1, lastColumn);
  var titleRangeValues = titleRange.getValues();
  
  var info = {
    'scorers': {},
    'average': -1
  };
  
  for (var j = 4; j < lastColumn; j++){
    var title = titleRangeValues[0][j];
    if(title == averageColumnTitle){
      info['average'] = j + 1;
    }else if(title != ''){
      info['scorers'][titleRangeValues[0][j]] = j + 1;
    }
  }
  
  return info;
  
}

function generateResults(){
  
  var scoreColumnInfo = getScoreColumnInfo();
  var averageIndex = scoreColumnInfo['average'] - 1;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Albums');
  var rangeData = sheet.getDataRange();
  var rowStart = 2;
  var lastRow = rangeData.getLastRow();
  
  var scoreRange = sheet.getRange(rowStart, 1, lastRow-1, scoreColumnInfo['average']);
  var scoreRangeValues = scoreRange.getValues();
  
  var scoreTallies = {};
  var year = '';
  
  scoreTallies['average'] = [];
  for(var scorer in scoreColumnInfo['scorers']){
    scoreTallies[scorer] = [];
  }
  
  for(var i = 0; i < lastRow - 1; i++){
    
    if(!isNaN(parseInt(scoreRangeValues[i][0]))){
      year = scoreRangeValues[i][0];
      
    }else{
      
      var artist = scoreRangeValues[i][0];
      var album = scoreRangeValues[i][1];
      
      for(var scorer in scoreColumnInfo['scorers']){
        var scorerIndex = scoreColumnInfo['scorers'][scorer];
        var score = scoreRangeValues[i][scorerIndex - 1];
        
        if(!isNaN(parseFloat(score))){
          scoreTallies[scorer].push({ artist: artist, album: album, year: year, score: score });
        }
        
      }
      
      var averageScore = scoreRangeValues[i][averageIndex];
      
      if(!isNaN(parseFloat(averageScore))){
        scoreTallies['average'].push({ artist: artist, album: album, year: year, score: averageScore });
      }
      
     }
    
  }
  
  for(var tallyName in scoreTallies){
    scoreTallies[tallyName].sort(compareTallyScores);
  }
  
  var scorers = Object.keys(scoreColumnInfo['scorers']);
  scorers.push('average');
  
  for(var k in scorers){
    var sheetName = 'Results: '+scorers[k];
    var sheet = ss.getSheetByName(sheetName);
    if(sheet) ss.deleteSheet(sheet);
    sheet = ss.insertSheet();
    sheet.setName(sheetName);
    
    for(var l in scoreTallies[scorers[k]]){
      var album = scoreTallies[scorers[k]][l];
      sheet.insertRows(l + 1, 1);
      var range = sheet.getRange(l + 1,5);
      range.setValues([l + 1, album.artist, album.album, album.year, album.score]);
    }
    
  }
  
}

function compareTallyScores(a, b){
  if ( a.score < b.score ) return 1;
  if ( a.score > b.score ) return -1;
  return 0;
}