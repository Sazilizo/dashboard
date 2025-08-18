import React, { useCallback, useMemo } from "react";
import { useAuth } from "../../context/useAuth";
import DynamicForm, { DynamicFormForStudents } from "../../utils/dynamicForm";

export default function MealForm() {
  // Memoize presetFields (empty or with defaults)
  const presetFields = useMemo(() => ({}), []);

  // Memoize fileUploadRouteBuilder
  // const fileUploadRouteBuilder = useCallback(
  //   (createdStudent) => `/uploads/student/files/${createdStudent.id}`,
  //   []
  // );

  const handleSuccess = (createdMeal) => {
    alert(`Meal created with ID: ${createdMeal.id}`);
    // maybe navigate or update UI here
  };

  return (
    <div>
      <h1>Create a meal</h1>
      <DynamicForm
        model="Meal"
        submitRoute="meals"
        schemaRoute="meals"
        twoStepFileUpload={true}
        // fileUploadRouteBuilder={fileUploadRouteBuilder}
        onSuccess={handleSuccess}
        presetFields={presetFields}
      />
    </div>
  );
}
