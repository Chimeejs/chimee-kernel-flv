/**
* 处理query的静态函数
* author songguangyu
* email 522963130@qq.com
*/
export default function (range, config) {
  if(config.seekType === 'range') {
    const headers = {};
    let param;
    if (range.to !== -1) {
        param = `bytes=${range.from.toString()}-${range.to.toString()}`;
    } else {
        param = `bytes=${range.from.toString()}-`;
    }
    headers['Range'] = param;
    return headers;
  } else {
    let param;
    if (range.to !== -1) {
        param = `?start=${range.from.toString()}&end=${range.to.toString()}`;
    } else {
        param = `?start=${range.from.toString()}`;
    }
    return param;
  }
};
