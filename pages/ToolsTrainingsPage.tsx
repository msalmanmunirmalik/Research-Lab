import React from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { AcademicCapIcon } from '../components/icons';
import TrainingCatalog from '../components/tools-trainings/TrainingCatalog';
import TrainingCourseView from '../components/tools-trainings/TrainingCourseView';
import '../styles/toolsTrainings.css';

const ToolsTrainingsPage: React.FC = () => {
  const { courseId } = useParams<{ courseId?: string }>();

  return (
    <div className="tt-page space-y-5">
      <PageHeader
        title="Trainings"
        subtitle="Lab orientation, safety, techniques, language, and research skills — course-style learning with videos and self-assessments."
        accent="teal"
        icon={<AcademicCapIcon />}
      />
      {courseId ? <TrainingCourseView courseId={courseId} /> : <TrainingCatalog />}
    </div>
  );
};

export default ToolsTrainingsPage;
