/* eslint no-console:0, camelcase: 0 */

const EventEmitter = require('events').EventEmitter;

const hold = require('hold-it');
const expect = require('chai').expect;

const { Edmodo } = require('../src/index.js');

const client_id = process.env.EDMODO_ID;
const client_secret = process.env.EDMODO_SECRET;

const emitter = new EventEmitter();
emitter.on('error', console.error.bind(console));
emitter.on('info', console.log.bind(console));

hold.add('tokens.student', {
  refresh_token: process.env.EDMODO_STUDENT_REFRESH,
  access_token: process.env.EDMODO_STUDENT_ACCESS,
  token_type: 'bearer',
  expires_in: 86400,
  lastRefresh: '2018-07-16T13:59:30.524Z',
});

hold.add('tokens.teacher', {
  refresh_token: process.env.EDMODO_TEACHER_REFRESH,
  access_token: process.env.EDMODO_TEACHER_ACCESS,
  token_type: 'bearer',
  expires_in: 86399,
  lastRefresh: '2017-10-11T11:43:18.921Z',
});

describe('Edmodo', () => {
  before(async () => {
    const opts = {
      client_id,
      client_secret,
      redirect_uri: 'https://google.com/lms/edmodo/callback',
      scope: ['all'],
    };
    const teacher = new Edmodo('teacher', emitter, opts, {}, {
      getToken: () => Promise.resolve(hold.get('tokens.teacher')),
      setToken: (userId, tokens) => Promise.resolve(hold.set('tokens.teacher', tokens)),
    });
    hold.add('teacher', teacher);

    const student = new Edmodo('student', emitter, opts, {}, {
      getToken: () => Promise.resolve(hold.get('tokens.student')),
      setToken: (userId, tokens) => Promise.resolve(hold.set('tokens.student', tokens)),
    });
    hold.add('student', student);
  });

  it('should get the groups', async () => {
    const teacher = hold.get('teacher');

    const groups = await teacher.getGroups('teacher');
    expect(groups).to.have.length(1);
    hold.add('group', groups[0]);
  });

  it('should be able to create assignment', async () => {
    const teacher = hold.get('teacher');
    const group = hold.get('group');

    const request = {
      courseId: String(group.id),
      title: 'We are testing',
      description: 'Maybe this time',
      link: {
        url: 'https://google.com',
        title: 'Google',
      },
      game: {
        name: 'This is a game',
        expiry: 3600,
        createdAt: new Date(),
      },
    };

    const assignment = await teacher.createAssignment('teacher', request);
    hold.add('assignment', assignment);
  });

  it('should be able to submit the assignment once', async () => {
    const student = hold.get('student');
    const assignment = hold.get('assignment');

    const request = {
      assignmentId: String(assignment.id),
      content: 'First response',
      link: {
        url: 'https://google.com',
        title: 'google',
      },
    };

    await student.submit('student', request);
  });

  it('should submit one more time', async () => {
    const student = hold.get('student');
    const assignment = hold.get('assignment');

    const request = {
      assignmentId: String(assignment.id),
      content: 'And another one',
      link: {
        url: 'https://google.com',
        title: 'google',
      },
    };

    const sub = await student.submit('student', request);
    hold.add('sub', sub);
  });

  it('should grade it', async () => {
    const sub = hold.get('sub');
    const assignment = hold.get('assignment');
    const teacher = hold.get('teacher');

    const request = {
      submitterId: sub.creator.id,
      assignmentId: assignment.id,
      score: 78,
    };

    await teacher.grade('teacher', request);
  });
});
