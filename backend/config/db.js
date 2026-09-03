const mysql = require('mysql2');

const mysqlConnection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4'
});

let isUsingMock = false;
let mockDB = null;

let connectionStarted = false;

function connect(callback = () => {}) {
  if (connectionStarted) return callback(isUsingMock ? new Error('当前使用内存模拟存储') : null);
  connectionStarted = true;
  mysqlConnection.connect((err) => {
  if (err) {
    console.error('MySQL连接失败，将使用内存模拟存储');
    isUsingMock = true;
    mockDB = require('./mockStore');
  } else {
    console.log('✅ MySQL连接成功');
  }
    callback(err);
  });
}

function query(sql, params, callback) {
  if (isUsingMock && mockDB) {
    mockDB.query(sql, params, callback);
  } else {
    mysqlConnection.query(sql, params, callback);
  }
}

module.exports = {
  connect,
  query: query
};
