
const moment = require('moment');

exports.addSeconds = (time, seconds) => {
  return moment(time).add(Number(seconds), 'seconds').valueOf();
};

exports.addWeeks = (date, week = 1) => {
  return moment(date.valueOf()).add(week, 'weeks').valueOf();
};
