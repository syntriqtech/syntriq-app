# Company Profile Setup

To use the Company Profile feature, you need to create a table in your Supabase database.

## SQL to Run in Supabase

Go to your Supabase dashboard → SQL Editor → New Query and run this:

```sql
CREATE TABLE IF NOT EXISTS company_profile (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  company_address TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- Enable RLS (Row Level Security)
ALTER TABLE company_profile ENABLE ROW LEVEL SECURITY;

-- Create policy so users can only see their own profile
CREATE POLICY "Users can view their own company profile"
  ON company_profile FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy so users can insert their own profile
CREATE POLICY "Users can insert their own company profile"
  ON company_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy so users can update their own profile
CREATE POLICY "Users can update their own company profile"
  ON company_profile FOR UPDATE
  USING (auth.uid() = user_id);
```

## What This Does

1. Creates a `company_profile` table tied to your user account
2. Stores: company name, address, contact name, email, and phone
3. Each user has exactly one company profile
4. Enables security so you can only see/edit your own profile

## After Running the SQL

1. Go to the app sidebar and click **Company Profile**
2. Fill in your contractor information
3. Click **Save Company Profile**
4. Your company info will now be used on all PDFs (G702, SOV, lien waivers, etc.)

The app will fall back to the default information if the table doesn't exist, but it won't be editable.
