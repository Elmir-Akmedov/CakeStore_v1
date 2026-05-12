def print_evens():
    for i in range(0, 20, 2):
        print(i)
    print(list(range(0, 20, 2)))
    
# print_evens()


x = [1, 1, 2, 2, 4, 3, 5]
def remove_duplicates(lst):
    return list(set(lst))

# print(remove_duplicates(x))

def factorial(n):
    return n * factorial(n - 1)

def find_polindrome(s):
    return s == s[::-1]

def func(x, b):
    return sorted(x + b)
print(func([1, 2, 3], [5, 4, 6]))