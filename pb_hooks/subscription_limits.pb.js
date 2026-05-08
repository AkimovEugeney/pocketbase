const fallbackPlanLimits = {
  free: {
    studentsLimit: 10,
    studentsUnlimited: false,
    allowStudentSubscriptions: false,
    allowGroupLessons: false,
    allowHomeworkModule: false,
  },
  pro: {
    studentsLimit: 50,
    studentsUnlimited: false,
    allowStudentSubscriptions: true,
    allowGroupLessons: true,
    allowHomeworkModule: true,
  },
  expert: {
    studentsLimit: null,
    studentsUnlimited: true,
    allowStudentSubscriptions: true,
    allowGroupLessons: true,
    allowHomeworkModule: true,
  },
};

function normalizePlanCode(rawCode) {
  const code = String(rawCode || "").trim().toLowerCase();
  if (code === "pro" || code === "expert") {
    return code;
  }
  return "free";
}

function getAuthUserId(e) {
  if (!e.auth) {
    throw new UnauthorizedError("Требуется авторизация");
  }

  return String(e.auth.id || e.auth.getString("id") || "").trim();
}

function getUserPlanConfig(app, ownerId) {
  const user = app.findRecordById("users", ownerId);
  const planCode = normalizePlanCode(user.getString("plan_code"));

  let planRecord = null;
  try {
    planRecord = app.findFirstRecordByFilter(
      "billing_plans",
      `code = \"${planCode}\" && is_active = true`,
    );
  } catch (_) {}

  if (!planRecord) {
    return {
      planCode,
      ...fallbackPlanLimits[planCode],
    };
  }

  return {
    planCode,
    studentsLimit: planRecord.get("students_limit"),
    studentsUnlimited: planRecord.getBool("students_unlimited"),
    allowStudentSubscriptions: planRecord.getBool("allow_student_subscriptions"),
    allowGroupLessons: planRecord.getBool("allow_group_lessons"),
    allowHomeworkModule: planRecord.getBool("allow_homework_module"),
  };
}

function countActiveStudents(app, ownerId, excludeStudentId = "") {
  const filters = [`owner = \"${ownerId}\"`, "is_active = true"];

  if (excludeStudentId) {
    filters.push(`id != \"${excludeStudentId}\"`);
  }

  const records = app.findRecordsByFilter(
    "students",
    filters.join(" && "),
    "",
    0,
    0,
  );

  return records.length;
}

function enforceActiveStudentsLimit(e) {
  if (e.hasSuperuserAuth()) {
    return;
  }

  const ownerId = getAuthUserId(e);
  const plan = getUserPlanConfig(e.app, ownerId);

  if (plan.studentsUnlimited) {
    return;
  }

  const numericLimit = Number(plan.studentsLimit);
  if (!Number.isFinite(numericLimit) || numericLimit < 0) {
    return;
  }

  const isActive = e.record.getBool("is_active");
  if (!isActive) {
    return;
  }

  const currentActiveCount = countActiveStudents(
    e.app,
    ownerId,
    String(e.record.id || ""),
  );

  if (currentActiveCount + 1 > numericLimit) {
    throw new BadRequestError(
      `Лимит активных учеников для тарифа ${plan.planCode.toUpperCase()} достигнут (${numericLimit})`,
    );
  }
}

function enforceGroupsAllowed(e) {
  if (e.hasSuperuserAuth()) {
    return;
  }

  const ownerId = getAuthUserId(e);
  const plan = getUserPlanConfig(e.app, ownerId);
  const lessonType = String(e.record.getString("lesson_type") || "").trim().toLowerCase();

  if (lessonType === "group" && !plan.allowGroupLessons) {
    throw new BadRequestError("Групповые занятия недоступны на текущем тарифе");
  }
}

function enforceStudentSubscriptionsAllowed(e) {
  if (e.hasSuperuserAuth()) {
    return;
  }

  const ownerId = getAuthUserId(e);
  const plan = getUserPlanConfig(e.app, ownerId);

  if (!plan.allowStudentSubscriptions) {
    throw new BadRequestError("Абонементы недоступны на текущем тарифе");
  }
}

onRecordCreateRequest((e) => {
  enforceActiveStudentsLimit(e);
  e.next();
}, "students");

onRecordUpdateRequest((e) => {
  enforceActiveStudentsLimit(e);
  e.next();
}, "students");

onRecordCreateRequest((e) => {
  enforceGroupsAllowed(e);
  e.next();
}, "lessons");

onRecordUpdateRequest((e) => {
  enforceGroupsAllowed(e);
  e.next();
}, "lessons");

onRecordCreateRequest((e) => {
  enforceStudentSubscriptionsAllowed(e);
  e.next();
}, "student_plans");

onRecordUpdateRequest((e) => {
  enforceStudentSubscriptionsAllowed(e);
  e.next();
}, "student_plans");
