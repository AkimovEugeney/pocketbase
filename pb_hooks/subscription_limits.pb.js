onRecordCreateRequest((e) => {
  const limits = require(`${__hooks}/lib/subscription_limits.js`);
  limits.enforceActiveStudentsLimit(e);
  e.next();
}, "students");

onRecordUpdateRequest((e) => {
  const limits = require(`${__hooks}/lib/subscription_limits.js`);
  limits.enforceActiveStudentsLimit(e);
  e.next();
}, "students");

onRecordCreateRequest((e) => {
  const limits = require(`${__hooks}/lib/subscription_limits.js`);
  limits.enforceGroupsAllowed(e);
  e.next();
}, "lessons");

onRecordUpdateRequest((e) => {
  const limits = require(`${__hooks}/lib/subscription_limits.js`);
  limits.enforceGroupsAllowed(e);
  e.next();
}, "lessons");

onRecordCreateRequest((e) => {
  const limits = require(`${__hooks}/lib/subscription_limits.js`);
  limits.enforceStudentSubscriptionsAllowed(e);
  e.next();
}, "student_plans");

onRecordUpdateRequest((e) => {
  const limits = require(`${__hooks}/lib/subscription_limits.js`);
  limits.enforceStudentSubscriptionsAllowed(e);
  e.next();
}, "student_plans");
