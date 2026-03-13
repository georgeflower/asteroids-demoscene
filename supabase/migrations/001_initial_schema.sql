-- Create high_scores table
CREATE TABLE IF NOT EXISTS public.high_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    initials TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create index for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_high_scores_score ON public.high_scores(score DESC);

-- Enable Row Level Security
ALTER TABLE public.high_scores ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Allow public read access" ON public.high_scores
    FOR SELECT
    USING (true);

-- Create policies for public insert access
CREATE POLICY "Allow public insert access" ON public.high_scores
    FOR INSERT
    WITH CHECK (true);
