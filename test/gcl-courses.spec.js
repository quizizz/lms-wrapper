
const EventEmitter = require('events').EventEmitter;

const hold = require('hold-it');
const expect = require('chai').expect;
const { GCL } = require('../src/index');

const client_id = process.env.GCL_ID;
const client_secret = process.env.GCL_SECRET;
const emitter = new EventEmitter();
emitter.on('error', console.error.bind(console));
emitter.on('info', console.log.bind(console));
process.on('unhandledRejection', (reason) => {
  console.error(reason);
});


hold.add('tokens.teacher', {
  lastRefresh: '2018-07-16T13:50:59.418Z',
  expires_in: null,
  token_type: 'Bearer',
  access_token: process.env.GCL_TEACHER_ACCESS,
  refresh_token: process.env.GCL_TEACHER_REFRESH,
});

console.log({
  access_token: process.env.GCL_TEACHER_ACCESS,
  refresh_token: process.env.GCL_TEACHER_REFRESH,
  client_id: process.env.GCL_ID,
  client_secret: process.env.GCL_SECRET,
})


describe('GCL', () => {
  before(async () => {
    const opts = {
      client_id,
      client_secret,
      redirect_uri: 'https://google.com/lms/gcl/callback',
      scope: ['all']
    };

    const teacher = new GCL('teacher', emitter, opts, {}, {
      getToken: () => Promise.resolve(hold.get('tokens.teacher')),
      setToken: (userId, tokens) => {
        console.log(`Updating teacher token to ${tokens.access_token}`);
        return Promise.resolve(hold.set('tokens.teacher', tokens));
      },
    });
    hold.add('teacher', teacher);
  });

  it('should list courses of the teacher', async function () {
    const teacher = hold.get('teacher');
    const courses = await teacher.getCourses('teacher');
    expect(courses).to.have.length(7);
    const course = courses.filter(c => c.name === 'Test Class')[0];
    hold.add('course', course);
  });

  it.skip('should create assignment', async () => {
    const course = hold.get('course');
    const teacher = hold.get('teacher');

    const request = {
      courseId: course.id,
      title: 'Testing',
      description: '1, 2 ,3',
      link: {
        url: 'https://google.com',
        title: 'Google',
      },
      game: {
        name: 'Ma name s Jeff',
        expiry: 3600,
        createdAt: new Date(),
      },
    };

    const assignment = await teacher.createAssignment('teacher', request);
    expect(assignment.courseId).to.equal(course.id);
    hold.add('assignment', assignment);
  });

  it.skip('should get all submissions', async function () {
    const assignment = hold.get('assignment');
    const teacher = hold.get('teacher');

    const request = {
      courseId: assignment.courseId,
      courseWorkId: assignment.id,
    };

    const submissions = await teacher.getAllSubmissions('teacher', request);
    expect(submissions).to.have.length(1);
  });

  it('should make an announcement', async function () {
    const course = hold.get('course');
    const teacher = hold.get('teacher');

    const request = {
      courseId: course.id,
      text: 'This is a test announcement',
      links: [{
        url: 'https://google.com',
        title: 'Google',
      }],
    };

    const assignment = await teacher.announce('teacher', request);
    expect(assignment.courseId).to.equal(course.id);
  });
});