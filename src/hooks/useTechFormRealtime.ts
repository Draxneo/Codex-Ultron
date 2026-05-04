import { useRealtimeInvalidation } from "@/hooks/useRealtimeInvalidation";

/**
 * Subscribes to real-time changes on tech_form_responses and tech_form_photos.
 * Invalidates progress counters and per-job response queries
 * so the dispatch board and job detail update live as techs fill in fields.
 *
 * Uses the shared useRealtimeInvalidation hook to reduce WebSocket connections.
 */
export function useTechFormRealtime(jobId?: string) {
  useRealtimeInvalidation(
    jobId
      ? [
          {
            table: "tech_form_responses",
            queryKeys: [
              ["tech_form_responses", jobId],
              ["tech_form_photos", jobId],
            ],
          },
          {
            table: "tech_form_photos",
            queryKeys: [
              ["tech_form_photos", jobId],
              ["tech_form_photos_grid", jobId],
              ["job_photos_gallery", jobId],
              ["job_attachments"],
            ],
          },
        ]
      : [],
    jobId ? `tech-form-live-${jobId}` : undefined
  );
}
