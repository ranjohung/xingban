const mysql = require('mysql2');

const mysqlConnection = process.env.USE_MOCK_DB === 'true' ? null : mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4'
});

let isUsingMock = false;
let mockDB = null;

let connectionStarted = false;
let lastError = null;

function connect(callback = () => {}) {
  if (connectionStarted) return callback(isUsingMock ? new Error('当前使用内存模拟存储') : null);
  connectionStarted = true;
  if (process.env.USE_MOCK_DB === 'true') {
    isUsingMock = true;
    mockDB = require('./mockStore');
    return callback(null);
  }
  mysqlConnection.connect((err) => {
  if (err) {
    lastError = err;
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_DB !== 'true') {
      console.error('MySQL连接失败，生产环境不会降级到内存存储');
    } else {
      console.error('MySQL连接失败，将使用内存模拟存储');
      isUsingMock = true;
      mockDB = require('./mockStore');
    }
  } else {
    lastError = null;
    console.log('✅ MySQL连接成功');
  }
    callback(err);
  });
}

function query(sql, params, callback) {
  if (isUsingMock && mockDB) {
    mockDB.query(sql, params, callback);
  } else if (lastError) {
    callback(new Error('数据库暂不可用'));
  } else {
    mysqlConnection.query(sql, params, callback);
  }
}

function status() {
  if (isUsingMock) return { ready: true, mode: 'mock' };
  if (lastError) return { ready: false, mode: 'unavailable' };
  return { ready: connectionStarted, mode: 'mysql' };
}

function withTransaction(work) {
  if (isUsingMock || lastError || !connectionStarted) return Promise.reject(new Error('事务数据库不可用'));
  return new Promise((resolve, reject) => {
    mysqlConnection.beginTransaction(beginError => {
      if (beginError) return reject(beginError);
      const tx = {
        query(sql, params = []) {
          return new Promise((queryResolve, queryReject) => {
            mysqlConnection.query(sql, params, (error, result) => error ? queryReject(error) : queryResolve(result));
          });
        }
      };
      Promise.resolve().then(() => work(tx)).then(result => {
        mysqlConnection.commit(commitError => {
          if (!commitError) return resolve(result);
          mysqlConnection.rollback(() => reject(commitError));
        });
      }).catch(error => mysqlConnection.rollback(() => reject(error)));
    });
  });
}

module.exports = {
  connect,
  query: query,
  withTransaction,
  status
};
