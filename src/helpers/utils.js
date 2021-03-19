/// <reference path='./utils.d.ts' />
const moment = require('moment');
const _ = require('lodash');

exports.addSeconds = (time, seconds) => {
  return moment(time).add(Number(seconds), 'seconds').valueOf();
};

exports.addWeeks = (date, week = 1) => {
  return moment(date.valueOf()).add(week, 'weeks').valueOf();
};

exports.paginatedCollect = async (lms, requestConfig) => {
  const results = [];
  let page = 1;
  while (true) {
    const result = await lms.makeRequest({
      query: { page, ...requestConfig.query },
      ...requestConfig,
    });
    if (!result || _.isEmpty(result) || (result.data && _.isEmpty(result.data))) {
      break;
    }
    page++;
    if (Array.isArray(result.data)) {
      results.push(...result.data);
    } else {
      results.push(result);
    }
  }
  return results;
}
