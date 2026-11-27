'use client';

import { CourseMapView } from '@/components/maps/CourseMapView';
import { Shell } from '@/components/ui/Shell';

// Mind maps: the learner's course as a map of its units and topics, with the links between topics. Each topic has a
// map of its own, at /maps/<topicId>.
export default function MapsPage() {
  return (
    <Shell width="wide">
      <CourseMapView />
    </Shell>
  );
}
