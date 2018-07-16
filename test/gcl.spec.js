/* eslint no-console:0, camelcase: 0 */

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

hold.add('tokens.student', {
  refresh_token: process.env.GCL_STUDENT_REFRESH,
  access_token: process.env.GCL_STUDENT_ACCESS,
  token_type: 'Bearer',
  expires_in: null,
  lastRefresh: '2018-07-16T13:50:44.171Z',
});

hold.add('tokens.teacher', {
  lastRefresh: '2018-07-16T13:50:59.418Z',
  expires_in: null,
  token_type: 'Bearer',
  access_token: process.env.GCL_TEACHER_ACCESS,
  refresh_token: process.env.GCL_TEACHER_REFRESH,
});

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

    const student = new GCL('student', emitter, opts, {}, {
      getToken: () => Promise.resolve(hold.get('tokens.student')),
      setToken: (userId, tokens) => {
        console.log(`Updating student token to ${tokens.access_token}`);
        return Promise.resolve(hold.set('tokens.student', tokens));
      },
    });
    hold.add('student', student);
  });

  it('should get the courses', async () => {
    const teacher = hold.get('teacher');

    const courses = await teacher.getCourses('teacher');

    expect(courses).to.have.length(6);

    const course = courses.filter(c => c.name === 'Test Class')[0];
    hold.add('course', course);
  });

  it('should create assignment', async () => {
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

  it('should get the submission for the student', async () => {
    const assignment = hold.get('assignment');
    const student = hold.get('student');

    const request = {
      courseId: assignment.courseId,
      courseWorkId: assignment.id,
    };

    const submission = await student.getStudentSubmission('student', request);
    console.log(submission);
    expect(submission.courseId).to.equal(assignment.courseId);
    expect(submission.courseWorkId).to.equal(assignment.id);
    hold.add('submission', submission);
  });

  it('should attach link', async () => {
    const submission = hold.get('submission');
    const student = hold.get('student');

    const request = {
      courseId: submission.courseId,
      courseWorkId: submission.courseWorkId,
      subId: submission.id,
      url: 'https://google.com',
    };

    const sub = await student.addLinkToSubmission('student', request);
    console.log(sub);
    expect(sub.state).to.equal('CREATED');
  });

  it('should trun in the assignment', async () => {
    const submission = hold.get('submission');
    const student = hold.get('student');

    const request = {
      courseId: submission.courseId,
      courseWorkId: submission.courseWorkId,
      subId: submission.id,
    };

    await student.submitStudentAssignment('student', request);
  });

  it('should recalim the assignment', async () => {
    const submission = hold.get('submission');
    const student = hold.get('student');

    const request = {
      courseId: submission.courseId,
      courseWorkId: submission.courseWorkId,
      subId: submission.id,
    };

    await student.reclaimSubmission('student', request);
  });

  it('should be able to add one more link', async () => {
    const submission = hold.get('submission');
    const student = hold.get('student');

    const request = {
      courseId: submission.courseId,
      courseWorkId: submission.courseWorkId,
      subId: submission.id,
      url: 'https://google.com',
    };

    const sub = await student.addLinkToSubmission('student', request);
    console.log(sub);
    expect(sub.state).to.equal('RECLAIMED_BY_STUDENT');
    hold.set('submission', sub);
  });

  it('should trun in the assignment', async () => {
    const submission = hold.get('submission');
    const student = hold.get('student');

    const request = {
      courseId: submission.courseId,
      courseWorkId: submission.courseWorkId,
      subId: submission.id,
    };

    await student.submitStudentAssignment('student', request);
  });

  it('should grade the assignments', async () => {
    const submission = hold.get('submission');
    const teacher = hold.get('teacher');

    const newSub = Object.assign({}, submission, {
      assignedGrade: 50,
      draftGrade: 50,
    });

    const request = {
      courseId: submission.courseId,
      courseWorkId: submission.courseWorkId,
      subId: submission.id,
      newSub,
    };

    await teacher.gradeAssignment('teacher', request);
  });

  it('should return the assignment', async () => {
    const submission = hold.get('submission');
    const teacher = hold.get('teacher');

    const request = {
      courseId: submission.courseId,
      courseWorkId: submission.courseWorkId,
      subId: submission.id,
    };

    await teacher.returnAssignment('teacher', request);
  });
});
