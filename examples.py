i: int=5
def fib(i:int)->int:
  if i > 0:
    return i * fib(i-1)
  return 1
x: bool = False
print (fib(i))
print (True)
print (None)
print (x)

##

k: bool = 4
def f(a: int) -> int:
    return a * 4
def g():
    print(f(3) + k)
    return
g()

##

def f(a: int) -> int:
    while a + 4:
        print(a)
    return 5
f(6)

##

def f(a: int) -> int:
    c: int = 3
    while a > 0:
        c = c + g(c)
        a = a - 1
    return c

def g(c: int) -> int:
    return c + 2

c:int = 5
print(f(c))

##

def f(a: int) -> int:
    b: int = 3
    c: bool = False
    while (a + b) > 0:
        if (a + b)%2 == 0:
            if (c):
                return a + b
        b = b - 1
        c = True
    return 6

print(f(7))

##

def fib(n):
    if n == 0:
        return 1
    elif n == 1:
        return 1
    elif n > 1:
        return fib(n-1) + fib(n-2)
    else:
        return 0

print(fib(4))

##

k: bool = False
def evenSum(a: int, bound: int) -> int:
    if (a % 2 != 0):
        return oddSum(a, bound)
    elif (a > bound):
        return 0
    return a + oddSum(a + 1, bound)

def oddSum(a: int, bound: int) -> int:
    if (a % 2 == 0):
        return evenSum(a, bound)
    elif (a > bound):
        return 0
    return a + evenSum(a + 1, bound)

print(evenSum(1, 10))

##

def f(a: int) -> bool:
    k: int = 3
    while (a // k):
        k = a + 1
        a = a%2
    return True
f(3)

##

a: int = 50
def f(b: int) -> int:
    if b > 25:
        return b * 2
    else:
        return b

print(f(a))
print(f(10))

##

p: bool = True
def f(q: bool) -> int:
    if q < 25:
        return 99
    else:
        return 500

print (f(p))
print(f(False))
    
##



def sum(n: int) -> int:
    if n < 1: return 0
    else: return sum(n - 1) + n

sum(4)

##

def sum(n: int) -> int:
    total: int = 0
    while n > 0:
        total = total + n
        n = n - 1
    return total

a:int = 3
a = sum(4)
print(a)
print(False)

##

def f():
    pass
def g():
    pass
print (g() is f())

##

c: int = 100
def f() -> bool:
    c: bool = True
    return c

print(f())

##

c: int = 100
def f() -> int:
    c = 9
    return c

##

c: int = 100
def f() -> int:
    c = True
    return c

##

target:int = 10
base:int = 2
def base2target(n:int)->int:
    i:int = 0
    rem:int = 0
    n_dec:int = 0
    while(n>0):
        rem = getrem(n)
        n_dec = n_dec + rem*power(i)
        n = n//10
        i = i + 1
    return n_dec
def power(exp:int)->int:
    if exp==0:
        return 1
    elif exp==1:
        return base
    else:
        return power(exp//2)*power(exp-exp//2)
def getrem(n:int)->int:
    return n%10
print(base2target(10111))