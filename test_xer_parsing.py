
from xerparser import Xer
import pandas as pd

xer_content = """%T	TASK
%F	task_id	task_code	task_name	status_code
%R	1	A100	Activity 1	TK_Active
%R	2	A101	Activity 2	TK_NotStart
%T	PROJWBS
%F	wbs_id	proj_id	wbs_short_name	wbs_name
%R	1	1	WBS1	Phase 1
"""

try:
    print("Parsing dummy XER content...")
    parser = Xer(xer_content)
    
    print("Parser attributes:", dir(parser))
    
    if hasattr(parser, 'task'):
        print(f"Found {len(parser.task)} tasks")
        print("First task:", vars(parser.task[0]))
    else:
        print("No 'task' attribute found")
        
    if hasattr(parser, 'projwbs'):
        print(f"Found {len(parser.projwbs)} WBS items")
    else:
        print("No 'projwbs' attribute found")

except Exception as e:
    print(f"Error: {e}")
