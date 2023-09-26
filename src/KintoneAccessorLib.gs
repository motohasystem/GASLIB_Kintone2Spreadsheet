function testSettingReader(){
    const reader = new SettingReader()
    reader.parseValues([
      ['fields', 'お名前','ラジオボタン','更新日時']
      , ['header', "氏名", "好み", "last update"]
      , ['sheet', "シート1"]
      , ['query', "order by レコード番号 desc"]
      , ['start', "B4"]
    ])
  
    console.log(reader.get("fields"))
    console.log(reader.get("query"))
    console.log(reader.get("xxxxxxxxxxxx"))
  
  }
  
  // 指定したシート名から設定値を取得する
  class SettingReader {
  
    constructor(sheet_name = '管理用') {
      // 一列目にここで定義した文字列が出現した場合に、それぞれの設定行とみなします。
      this.index_fields = "fields"  // kintoneのフィールド名
      this.index_query = 'query'    // kintoneの絞り込みクエリ
    
      this.index_header = 'header'  // 出力時の見出し
      this.index_startcell = 'start'  // 出力時の開始セル（テーブルの左上のセル）
      this.index_sheetname = 'sheet'  // 管理用シートのシート名
  
      this.sheet_name = sheet_name
      this.settings = {}
    }
  
    get(key) {
      if(key in this.settings){
        return this.settings[key]
      }
  
      return [""]
    }
  
    read() {
      const active = SpreadsheetApp.getActiveSpreadsheet()
      const sheet = active.getSheetByName(this.sheet_name)
      if(sheet == null){
        console.error(`シート名[${this.sheet_name}]が取得できませんでした。`)
        return
      }
  
      // const col_index = sheet.getRange("A1:Z10")  // A列を50行まで取得して探索範囲とする
      const col_index = sheet.getRange("A1:Z10")  // A列を50行まで取得して探索範囲とする
      const values = col_index.getValues()
  
      this.parseValues(values)
    }
  
    // 二次元配列を受け取って設定として読み込む
    parseValues(values){
      // console.log(values)
      values.reduce(((prev, value)=>{
        // console.log(value[0])
        if([
          this.index_fields
          , this.index_query
          , this.index_header
          , this.index_startcell
          , this.index_sheetname
          ].includes(value[0])){
            // console.log(value)
            this.settings[value[0]] = this._fit(value.slice(1))
          }
        return prev
      }), [])
  
    }
  
    // 配列のうち空の要素を除去する
    _fit(values){
      return values.reduce((prev, val)=>{
        if(val.length > 0){
          prev.push(val)
        }
        return prev
      }, [])
    }
  }
  // this.settingReader = SettingReader
  
  // kintoneにアクセスしてレコードを取得する
  class KintoneAccessor {
    constructor(api_subdomain, app_id){
      this.api_url = `https://${api_subdomain}.cybozu.com/`
      this.app_id = app_id
      this.fields = []
      this.query = ""
  
    }
  
    setApiToken(token){
      this.api_token = token
    }
    setFields(fields) {
      this.fields = fields
    }
    setQuery(query){
      this.query = query
    }
  
    // kintone record形式を二次元配列に変換する
    convertToArray(rows, records){
      const result = records.map((record)=>{
        return rows.map((row)=>{
          return record[row].value
        })
      })
  
      result.unshift(rows)
      return result
    }
  
    getAllRecordsOnArray(){
      const records = this.getAllRecords()
      return this.convertToArray(this.fields, records)
    }
  
    getAllRecords() {
      const data = {
        'app':this.app_id,
        'size': 500
      }
  
      if(this.fields.length > 0){
        data['fields'] = this.fields
      }
  
      if(this.query.length > 0){
        data['query'] = this.query
      }
  
      let records = []
  
      const cursor = this.createCursor(data);
      const records_data = this.getCursor(cursor.id);
      // console.log(records_data.records);  //consoleにレコード情報を表示
      records = records.concat(records_data.records)
  
      //レコード情報をすべて取得するまで繰り返す
      while(records_data.next){
        records_data = this.getCursor(cursor.id);
        // console.log(records_data.records);//consoleにレコード情報を表示
        records = records.concat(records_data.records)
      }
  
      // console.log(records)
      return records
    }
  
  
    //カーソルの作成
    createCursor(data)
    {
      const headers = {
        'Content-Type':'application/json',
        'X-Cybozu-API-Token': this.api_token
      };
  
      const options = {
        'method' : 'post',
        "headers" : headers,
        'payload' : JSON.stringify(data)
      };
      // console.log({options})
      const response = UrlFetchApp.fetch(this.api_url+'/k/v1/records/cursor.json', options);
      return JSON.parse(response);
    }
  
    //カーソルIDからレコード情報の取得
    getCursor(id)
    { 
      const headers = {
        'X-Cybozu-API-Token': this.api_token
      };
      const options = {
        'method' : 'get',
        "headers" : headers
      };
      const response = UrlFetchApp.fetch(this.api_url+'/k/v1/records/cursor.json?id='+id, options);
      return JSON.parse(response);
    }
  }
  // this.kintoneAccessor = KintoneAccessor
  
  function fetchAndPaste(subdomain, app_id, api_token, config_sheet = "管理用"){
    const reader = new SettingReader(config_sheet)
    reader.read()
    const accessor = new KintoneAccessor(subdomain, app_id)
    accessor.setApiToken(api_token)
  
    const fields = reader.get('fields')
    accessor.setFields(fields)
    accessor.setQuery(reader.get('query')[0])
  
    const records = accessor.getAllRecordsOnArray()
  
    // ヘッダをテーブル見出しに書き換え
    records[0] = reader.get('header')
  
    // updateOrAppendData(records, sheet, start)
    const sheetname = reader.get('sheet')
    const start = reader.get('start')
    overwriteData(records, sheetname, start)
  }
  
  function overwriteData(data, sheetName, startCell) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if(sheet == null){
      console.error(`シート名[${sheetName}]が取得できませんでした。`)
      return
    }
    if(sheetName == ""){
        sheetName = "シート1"
    }

    if(startCell == ""){
      startCell = "A1"
    }
    
    var range = sheet.getRange(startCell);
    var startRow = range.getRow();
    var startCol = range.getColumn();
  
    // 二次元配列のデータを上書き
    sheet.getRange(startRow, startCol, data.length, data[0].length).setValues(data);
  }
  
  