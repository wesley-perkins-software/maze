declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type EventParams = Record<string, string | number | boolean | null | undefined>;

export function trackEvent(name: string, params?: EventParams): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

export interface MazeContextParams {
  maze_context: 'daily' | 'library' | 'generator' | 'printable';
  maze_size: string;
  maze_difficulty: string;
  maze_id?: string;
}

export interface SolveParams {
  elapsed_ms: number;
  elapsed_sec: number;
  steps: number;
  hints_used: number;
}

export function trackMazeStarted(params: MazeContextParams): void {
  trackEvent('maze_started', params);
}

export function trackMazeCompleted(params: MazeContextParams & SolveParams): void {
  trackEvent('maze_completed', params);
}

export function trackSessionResumed(params: MazeContextParams): void {
  trackEvent('session_resumed', params);
}

export function trackMazeReset(maze_context: string): void {
  trackEvent('maze_reset', { maze_context });
}

export function trackHintToggled(visible: boolean, maze_context: string): void {
  trackEvent('hint_toggled', { visible, maze_context });
}

export function trackSolutionToggled(visible: boolean, maze_context: string): void {
  trackEvent('solution_toggled', { visible, maze_context });
}

export function trackTraveledPathToggled(visible: boolean, maze_context: string): void {
  trackEvent('traveled_path_toggled', { visible, maze_context });
}

export function trackMazeGenerated(params: {
  maze_context: string;
  maze_difficulty: string;
  maze_size: string;
  width: number;
  height: number;
}): void {
  trackEvent('maze_generated', params);
}

export function trackMazeSizeSelected(maze_context: string, maze_difficulty: string): void {
  trackEvent('maze_size_selected', { maze_context, maze_difficulty });
}

export function trackMazePrinted(params: {
  maze_context: string;
  maze_difficulty: string;
  maze_size: string;
  source_page: string;
  include_answer_key: boolean;
}): void {
  trackEvent('maze_printed', params);
}

export function trackMazeDownloaded(params: {
  maze_context: string;
  maze_difficulty: string;
  maze_size: string;
  source_page: string;
  file_type: string;
}): void {
  trackEvent('maze_downloaded', params);
}

export function trackPrintableAnswerKeyToggled(visible: boolean): void {
  trackEvent('printable_answer_key_toggled', { visible });
}

export function trackCtaClicked(cta_id: string, source_page: string, destination: string): void {
  trackEvent('cta_clicked', { cta_id, source_page, destination });
}

export function trackLibraryCollectionViewed(difficulty: string): void {
  trackEvent('library_collection_viewed', { difficulty });
}

export function trackLibraryPlayNextClicked(params: {
  from_maze_id: string;
  to_maze_id: string;
  difficulty: string;
}): void {
  trackEvent('library_play_next_clicked', params);
}

export function trackPostSolveActionClicked(action: string, maze_context: string): void {
  trackEvent('post_solve_action_clicked', { action, maze_context });
}

export function trackShareResult(maze_context: string, method: 'native_share' | 'copy_link'): void {
  trackEvent('share_result', { maze_context, method });
}

export function trackDailyStreakMilestone(current_streak: number, longest_streak: number): void {
  trackEvent('daily_streak_milestone', { current_streak, longest_streak });
}
