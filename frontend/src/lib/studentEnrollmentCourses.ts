export type StudentEnrollmentReference = {
  studentId: string;
  courseId: string;
};

export function attachStudentEnrollmentMetadata<TCourse extends { id: string }, TEnrollment extends StudentEnrollmentReference>(
  courses: TCourse[],
  studentId: string,
  enrollments: TEnrollment[],
): Array<{ course: TCourse; enrollment: TEnrollment | undefined }> {
  return courses.map((course) => ({
    course,
    enrollment: enrollments.find(
      (entry) => entry.studentId === studentId && entry.courseId === course.id,
    ),
  }));
}